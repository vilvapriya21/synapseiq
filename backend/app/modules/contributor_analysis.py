"""Repository contributor analysis using Git history and provider APIs."""

from pathlib import Path
from urllib.parse import quote, urlparse
import base64
import logging
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

logger = logging.getLogger(__name__)


def sanitize_git_error(value: str) -> str:
    """Remove credentials embedded in authenticated clone URLs.

    Args:
        value: Git command output that may contain authenticated URLs.

    Returns:
        Sanitized command output with embedded credentials masked.
    """
    return re.sub(r"(https://)[^/@\s]+@", r"\1***@", value)


def clone_with_history(clone_url: str, target_dir: Path) -> None:
    """Clone a repository with full history for contributor analysis.

    Args:
        clone_url: Repository clone URL.
        target_dir: Directory where cloned files should be written.

    Raises:
        Exception: If the operation cannot be completed.
    """
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
        stderr = sanitize_git_error(exc.stderr or "")
        stderr_lower = stderr.lower()
        if "authentication failed" in stderr_lower or "access denied" in stderr_lower:
            raise Exception("Authentication failed. Reconnect the repository provider account and try again.")
        if "repository not found" in stderr_lower or "not found" in stderr_lower:
            raise Exception(
                "Repository not found. Check the URL or connect your account to access private repositories."
            )
        if "could not resolve host" in stderr_lower:
            raise Exception("Could not reach the git server. Check the URL.")
        raise Exception(f"Git clone failed: {stderr[:200]}")
    except subprocess.TimeoutExpired as exc:
        raise Exception(
            "Repository cloning timed out after 10 minutes. The repository history may be too large."
        ) from exc


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
    """Normalize an email address for contributor aggregation.

    Args:
        email: Email address to look up or normalize.

    Returns:
        Result produced by the operation.
    """
    return email.strip().lower()


def is_bot_account(name: str, email: str) -> bool:
    """Return whether a contributor identity appears to be automated.

    Args:
        name: Display name for the contributor or user.
        email: Email address to look up or normalize.

    Returns:
        Result produced by the operation.
    """
    identity = f"{name} {email}".lower()
    return any(marker in identity for marker in BOT_ACCOUNT_MARKERS)


def get_or_create_contributor(authorship: dict[str, dict], name: str, email: str) -> dict | None:
    """Create or return an in-memory contributor aggregate.

    Args:
        authorship: Mutable contributor aggregate keyed by normalized email.
        name: Display name for the contributor or user.
        email: Email address to look up or normalize.

    Returns:
        Result produced by the operation.
    """
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


def extract_commit_authorship(repo_dir: Path, seen_commit_shas: set[str] | None = None) -> dict[str, dict]:
    """Extract contributor authorship metrics from Git commit history.

    Args:
        repo_dir: repo_dir value used by the operation.
        seen_commit_shas: Set of commit SHAs already included in contributor metrics.

    Returns:
        Result produced by the operation.

    Raises:
        Exception: If the operation cannot be completed.
    """
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

            _, commit_hash, author_name, author_email, _committer_name, _committer_email = parts
            if seen_commit_shas is not None:
                seen_commit_shas.add(commit_hash.lower())
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
    """Parse supported Azure DevOps repository URLs into API components.

    Args:
        url: Repository URL or API URL to process.

    Returns:
        Result produced by the operation.
    """
    parsed = urlparse(url.strip().rstrip("/"))
    path_parts = [part for part in parsed.path.strip("/").split("/") if part]

    if parsed.netloc.lower() == "dev.azure.com" and len(path_parts) >= 4 and path_parts[2] == "_git":
        return path_parts[0], path_parts[1], path_parts[3]

    visualstudio_match = re.match(r"^([^.]+)\.visualstudio\.com$", parsed.netloc, re.IGNORECASE)
    if visualstudio_match and len(path_parts) >= 3 and path_parts[1] == "_git":
        return visualstudio_match.group(1), path_parts[0], path_parts[2]

    return None


def get_azure_auth_header(azure_token: str) -> dict[str, str]:
    """Build the Basic authentication header for an Azure DevOps PAT.

    Args:
        azure_token: Azure DevOps Personal Access Token.

    Returns:
        Result produced by the operation.
    """
    auth_token = base64.b64encode(f":{azure_token}".encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {auth_token}"}


def get_azure_paginated_values(
    api_url: str,
    azure_token: str,
    params: dict[str, str | int],
) -> list[dict]:
    """Fetch all paginated values from an Azure DevOps API endpoint.

    Args:
        api_url: Azure DevOps API endpoint URL.
        azure_token: Azure DevOps Personal Access Token.
        params: Query parameters to send with the provider API request.

    Returns:
        Result produced by the operation.
    """
    values: list[dict] = []
    continuation_token: str | None = None
    headers = get_azure_auth_header(azure_token)

    while True:
        request_params = {**params, "$top": 100}
        if continuation_token:
            request_params["continuationToken"] = continuation_token

        response = httpx.get(
            api_url,
            params=request_params,
            headers=headers,
            timeout=20,
        )
        response.raise_for_status()
        values.extend(response.json().get("value", []))

        continuation_token = response.headers.get("x-ms-continuationtoken")
        if not continuation_token:
            return values


def get_pull_request_commits(
    org: str,
    project: str,
    repo: str,
    pr_id: int | str,
    azure_token: str,
) -> list[dict]:
    """Fetch commits associated with an Azure DevOps pull request.

    Args:
        org: Azure DevOps organization name.
        project: Azure DevOps project name.
        repo: Azure DevOps repository name.
        pr_id: Azure DevOps pull request identifier.
        azure_token: Azure DevOps Personal Access Token.

    Returns:
        Result produced by the operation.
    """
    api_url = (
        f"https://dev.azure.com/{quote(org, safe='')}/{quote(project, safe='')}"
        f"/_apis/git/repositories/{quote(repo, safe='')}/pullRequests/{quote(str(pr_id), safe='')}/commits"
    )
    return get_azure_paginated_values(
        api_url,
        azure_token,
        {"api-version": "7.1-preview.1"},
    )


# Azure Code (Read) PAT scope covers clone plus these PR/commit APIs. If this
# consistently logs 401/403, re-verify the stored PAT under User Settings >
# Personal Access Tokens and ensure Code (Read) is enabled.
def enrich_with_azure_commit_history(
    authorship: dict[str, dict],
    repository_url: str,
    azure_token: str | None,
    seen_commit_shas: set[str],
) -> None:
    """Augment contributor metrics with Azure DevOps pull request history.

    Args:
        authorship: Mutable contributor aggregate keyed by normalized email.
        repository_url: Repository URL to inspect or query.
        azure_token: Azure DevOps Personal Access Token.
        seen_commit_shas: Set of commit SHAs already included in contributor metrics.
    """
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

    try:
        pull_requests = get_azure_paginated_values(
            api_url,
            azure_token,
            {"searchCriteria.status": "completed", "api-version": "7.1-preview.1"},
        )
    except httpx.HTTPStatusError as exc:
        logger.warning(
            f"Azure PR enrichment failed for repo {repository_url}: "
            f"{exc.response.status_code} {exc.response.text[:200]}"
        )
        return
    except Exception as exc:
        logger.warning(f"Azure PR enrichment failed for repo {repository_url}: {exc}")
        return

    for pull_request in pull_requests:
        creator = pull_request.get("createdBy") or {}
        name = creator.get("displayName") or ""
        email = creator.get("uniqueName") or creator.get("id") or ""
        contributor = get_or_create_contributor(authorship, name, email)
        if contributor is not None:
            contributor["prs_authored"] += 1

        pr_id = pull_request.get("pullRequestId")
        if pr_id is None:
            continue

        try:
            pull_request_commits = get_pull_request_commits(org, project, repo, pr_id, azure_token)
        except httpx.HTTPStatusError as exc:
            logger.warning(
                f"Azure PR enrichment failed for repo {repository_url}: "
                f"{exc.response.status_code} {exc.response.text[:200]}"
            )
            return
        except Exception as exc:
            logger.warning(f"Azure PR enrichment failed for repo {repository_url}: {exc}")
            return

        for commit in pull_request_commits:
            commit_id = (commit.get("commitId") or "").lower()
            if not commit_id or commit_id in seen_commit_shas:
                continue

            author = commit.get("author") or {}
            commit_author = get_or_create_contributor(
                authorship,
                author.get("name") or "",
                author.get("email") or "",
            )
            if commit_author is not None:
                commit_author["commit_count"] += 1
                seen_commit_shas.add(commit_id)


def top_files_string(file_counts: dict[str, int], limit: int = 10) -> str:
    """Serialize a contributor top-files map for storage.

    Args:
        file_counts: file_counts value used by the operation.
        limit: Maximum number of items to include.

    Returns:
        Result produced by the operation.
    """
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
    """Analyze repository history and persist contributor metrics.

    Args:
        repo_id: Repository identifier.
        db: Database session used for persistence and queries.
        github_token: github_token value used by the operation.
        azure_token: Azure DevOps Personal Access Token.
        gitlab_token: gitlab_token value used by the operation.
        bitbucket_token: bitbucket_token value used by the operation.
    """
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
        seen_commit_shas: set[str] = set()
        authorship = extract_commit_authorship(temp_dir / "repo", seen_commit_shas)
        if repository.provider == "azure":
            enrich_with_azure_commit_history(authorship, repository.url or "", azure_token, seen_commit_shas)

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
