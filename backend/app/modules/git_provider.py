import re
from urllib.parse import urlparse


PROVIDER_PATTERNS: list[tuple[str, str]] = [
    ("github", r"https?://(www\.)?github\.com/"),
    ("gitlab", r"https?://(www\.)?gitlab\.com/"),
    ("bitbucket", r"https?://(www\.)?bitbucket\.org/"),
    ("azure", r"https?://dev\.azure\.com/"),
    ("azure", r"https?://[a-zA-Z0-9-]+\.visualstudio\.com/"),
]


def detect_provider(url: str) -> str:
    for provider, pattern in PROVIDER_PATTERNS:
        if re.match(pattern, url):
            return provider
    return "other"


def is_valid_git_url(url: str) -> bool:
    if not url.startswith("https://"):
        return False

    parsed_url = urlparse(url)
    return bool(parsed_url.netloc and parsed_url.path.strip("/"))


def build_authenticated_url(url: str, token: str | None, provider: str) -> str:
    clone_url = url if url.endswith(".git") else f"{url}.git"
    if not token:
        return clone_url

    if provider == "github":
        return clone_url.replace("https://github.com/", f"https://oauth2:{token}@github.com/", 1)

    if provider == "gitlab":
        return clone_url.replace("https://gitlab.com/", f"https://oauth2:{token}@gitlab.com/", 1)

    if provider == "bitbucket":
        # Bitbucket needs username:app_password format; keep original URL for now.
        return clone_url

    if provider == "azure":
        return clone_url

    return clone_url


def extract_repo_name(url: str) -> str:
    repo_url = url.rstrip("/")
    if repo_url.endswith(".git"):
        repo_url = repo_url[:-4]
    return repo_url.split("/")[-1]
