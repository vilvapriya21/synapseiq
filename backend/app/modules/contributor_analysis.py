from pathlib import Path
from urllib.parse import quote, urlparse
import base64
import re
import shutil
import subprocess
import tempfile

import httpx
from sqlalchemy import delete as sql_delete
from sqlalchemy.orm import Session

from app.models.contributor import Contributor
from app.models.repository import Repository
from app.modules.git_provider import build_authenticated_url


def clone_with_history(clone_url: str, target_dir: Path) -> None:
    command = ["git", "clone", clone_url, str(target_dir)]
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


BOT_ACCOUNT_MARKERS = (
    "noreply",
    "build",
    "pipeline",
    "azuredevops",
    "service",
    "project collection build service",
    "bot",
)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def is_bot_account(name: str, email: str) -> bool:
    identity = f"{name} {email}".lower()
    return any(marker in identity for marker in BOT_ACCOUNT_MARKERS)


def get_or_create_contributor(authorship: dict[str, dict], name: str, email: str) -> dict | None:
    normalized_email = normalize_email(email)
    if not normalized_email or is_bot_account(name, normalized_email):
        return None

    return authorship.setdefault(
        normalized_email,
        {
            "name": name.strip() or normalized_email,
            "email": normalized_email,
            "commit_count": 0,
            "file_counts": {},
            "files_touched": set(),
            "lines_added": 0,
            "lines_deleted": 0,
            "prs_authored": 0,
        },
    )


def extract_commit_authorship(repo_dir: Path) -> dict[str, dict]:
    result = subprocess.run(
        ["git", "log", "--all", "--numstat", '--format=COMMIT|%H|%an|%ae|%cn|%ce'],
        cwd=repo_dir,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise Exception(f"Git log failed: {(result.stderr or '')[:200]}")

    authorship: dict[str, dict] = {}
    current_contributor: dict | None = None

    for line in result.stdout.splitlines():
        line = line.rstrip()
        if not line:
            continue

        if line.startswith("COMMIT|"):
            parts = line.split("|", 5)
            if len(parts) != 6:
                current_contributor = None
                continue

            _, _commit_hash, author_name, author_email, _committer_name, _committer_email = parts
            current_contributor = get_or_create_contributor(authorship, author_name, author_email)
            if current_contributor is not None:
                current_contributor["commit_count"] += 1
            continue

        if current_contributor is None:
            continue

        numstat_parts = line.split("\t")
        if len(numstat_parts) < 3:
            continue

        added_raw, deleted_raw, file_path = numstat_parts[0], numstat_parts[1], numstat_parts[2]
        file_counts = current_contributor["file_counts"]
        file_counts[file_path] = file_counts.get(file_path, 0) + 1
        current_contributor["files_touched"].add(file_path)

        if added_raw.isdigit():
            current_contributor["lines_added"] += int(added_raw)
        if deleted_raw.isdigit():
            current_contributor["lines_deleted"] += int(deleted_raw)

    return authorship


def parse_azure_repo_url(url: str) -> tuple[str, str, str] | None:
    parsed = urlparse(url.strip().rstrip("/"))
    path_parts = [part for part in parsed.path.strip("/").split("/") if part]

    if parsed.netloc.lower() == "dev.azure.com" and len(path_parts) >= 4 and path_parts[2] == "_git":
        return path_parts[0], path_parts[1], path_parts[3]

    visualstudio_match = re.match(r"^([^.]+)\.visualstudio\.com$", parsed.netloc, re.IGNORECASE)
    if visualstudio_match and len(path_parts) >= 3 and path_parts[1] == "_git":
        return visualstudio_match.group(1), path_parts[0], path_parts[2]

    return None


def enrich_with_azure_pr_authors(authorship: dict[str, dict], repository_url: str, azure_token: str | None) -> None:
    if not azure_token:
        return

    parsed = parse_azure_repo_url(repository_url)
    if parsed is None:
        return

    org, project, repo = parsed
    api_url = (
        f"https://dev.azure.com/{quote(org, safe='')}/{quote(project, safe='')}"
        f"/_apis/git/repositories/{quote(repo, safe='')}/pullrequests"
    )
    auth_token = base64.b64encode(f":{azure_token}".encode("utf-8")).decode("ascii")

    try:
        response = httpx.get(
            api_url,
            params={"searchCriteria.status": "completed", "api-version": "7.1-preview.1"},
            headers={"Authorization": f"Basic {auth_token}"},
            timeout=20,
        )
        response.raise_for_status()
        pull_requests = response.json().get("value", [])
    except Exception:
        return

    for pull_request in pull_requests:
        creator = pull_request.get("createdBy") or {}
        name = creator.get("displayName") or ""
        email = creator.get("uniqueName") or creator.get("id") or ""
        contributor = get_or_create_contributor(authorship, name, email)
        if contributor is not None:
            contributor["prs_authored"] += 1


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
        if repository.provider == "azure":
            enrich_with_azure_pr_authors(authorship, repository.url or "", azure_token)

        db.execute(sql_delete(Contributor).where(Contributor.repository_id == repo_id))
        for email, data in authorship.items():
            contributor = Contributor(
                repository_id=repo_id,
                name=data["name"],
                email=email,
                commit_count=data["commit_count"],
                files_touched=len(data["files_touched"]),
                lines_added=data["lines_added"],
                lines_deleted=data["lines_deleted"],
                prs_authored=data["prs_authored"],
                top_files=top_files_string(data["file_counts"]),
            )
            db.add(contributor)

        db.commit()
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
