import re

PROVIDER_PATTERNS: list[tuple[str, str]] = [
    ("github", r"https?://(www\.)?github\.com/"),
    ("gitlab", r"https?://(www\.)?gitlab\.com/"),
    ("bitbucket", r"https?://(www\.)?bitbucket\.org/"),
    ("azure", r"https?://dev\.azure\.com/"),
    ("azure", r"https?://[a-zA-Z0-9-]+\.visualstudio\.com/"),
]


def detect_provider(url: str) -> str:
    url = url.strip()
    for provider, pattern in PROVIDER_PATTERNS:
        if re.match(pattern, url, re.IGNORECASE):
            return provider
    return "other"


def is_valid_git_url(url: str) -> bool:
    url = url.strip()
    if not url.startswith("https://"):
        return False
    # Must have a path component after the domain
    without_scheme = url[len("https://"):]
    if "/" not in without_scheme:
        return False
    path = without_scheme.split("/", 1)[1]
    return bool(path.strip("/"))


def _clean_url(url: str) -> str:
    """Strip whitespace, trailing slashes, and .git suffix for consistent processing."""
    url = url.strip()
    url = url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    return url


def build_authenticated_url(url: str, token: str | None, provider: str) -> str:
    """
    Inject a user's OAuth token into the clone URL.
    Returns a URL safe to pass directly to `git clone`.
    Always ends with .git.
    """
    url = url.strip()
    base = _clean_url(url)

    if not token:
        # Public repo - no auth, just ensure .git suffix
        return base + ".git"

    if provider == "github":
        # GitHub: https://oauth2:{token}@github.com/org/repo.git
        authenticated = base.replace(
            "https://github.com/",
            f"https://oauth2:{token}@github.com/",
            1,
        )
        return authenticated + ".git"

    if provider == "gitlab":
        # GitLab uses the same oauth2 pattern
        authenticated = base.replace(
            "https://gitlab.com/",
            f"https://oauth2:{token}@gitlab.com/",
            1,
        )
        return authenticated + ".git"

    if provider == "bitbucket":
        # Bitbucket uses x-token-auth for app passwords / OAuth tokens
        authenticated = base.replace(
            "https://bitbucket.org/",
            f"https://x-token-auth:{token}@bitbucket.org/",
            1,
        )
        return authenticated + ".git"

    # azure, other - return as-is with .git (token handling varies, future enhancement)
    return base + ".git"


def extract_repo_name(url: str) -> str:
    """Extract the repository name from a git URL."""
    base = _clean_url(url)
    return base.rstrip("/").split("/")[-1]
