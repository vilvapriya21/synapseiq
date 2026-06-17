from pathlib import Path
import shutil
import subprocess
import tempfile

from sqlalchemy import delete as sql_delete
from sqlalchemy.orm import Session

from app.models.contributor import Contributor
from app.models.repository import Repository
from app.modules.git_provider import build_authenticated_url


def clone_with_history(clone_url: str, target_dir: Path) -> None:
    command = ["git", "clone", "--single-branch", clone_url, str(target_dir)]
    try:
        subprocess.run(
            command,
            check=True,
            timeout=600,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr or ""
        if "Authentication failed" in stderr:
            raise Exception("Authentication failed. Connect your GitHub account and try again.")
        if "Repository not found" in stderr or "not found" in stderr:
            raise Exception(
                "Repository not found. Check the URL or connect your account to access private repositories."
            )
        if "could not resolve host" in stderr:
            raise Exception("Could not reach the git server. Check the URL.")
        raise Exception(f"Git clone failed: {stderr[:200]}")


def extract_commit_authorship(repo_dir: Path) -> dict[str, dict]:
    result = subprocess.run(
        ["git", "log", '--pretty=format:COMMIT|%an|%ae', "--name-only"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
    )

    authorship: dict[str, dict] = {}
    current_email: str | None = None

    for line in result.stdout.splitlines()[:5000]:
        line = line.strip()
        if not line:
            continue

        if line.startswith("COMMIT|"):
            parts = line.split("|", 2)
            if len(parts) != 3:
                current_email = None
                continue

            _, name, email = parts
            current_email = email
            authorship.setdefault(email, {"name": name, "commit_count": 0, "file_counts": {}})
            authorship[email]["commit_count"] += 1
            continue

        if current_email is None:
            continue

        file_counts = authorship[current_email]["file_counts"]
        file_counts[line] = file_counts.get(line, 0) + 1

    return authorship


def top_files_string(file_counts: dict[str, int], limit: int = 10) -> str:
    top_files = sorted(file_counts.items(), key=lambda item: item[1], reverse=True)[:limit]
    return ",".join(f"{path}:{count}" for path, count in top_files)[:2000]


def analyze_contributors(
    repo_id: str,
    db: Session,
    github_token,
    azure_token,
    gitlab_token,
    bitbucket_token,
) -> None:
    repository = db.get(Repository, repo_id)
    if repository is None:
        return

    temp_dir = Path(tempfile.mkdtemp())
    try:
        token_map = {
            "github": github_token,
            "azure": azure_token,
            "gitlab": gitlab_token,
            "bitbucket": bitbucket_token,
        }
        token_for_provider = token_map.get(repository.provider)
        auth_url = build_authenticated_url(repository.url, token_for_provider, repository.provider)

        clone_with_history(auth_url, temp_dir / "repo")
        authorship = extract_commit_authorship(temp_dir / "repo")

        db.execute(sql_delete(Contributor).where(Contributor.repository_id == repo_id))
        for email, data in authorship.items():
            contributor = Contributor(
                repository_id=repo_id,
                name=data["name"],
                email=email,
                commit_count=data["commit_count"],
                top_files=top_files_string(data["file_counts"]),
            )
            db.add(contributor)

        db.commit()
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
