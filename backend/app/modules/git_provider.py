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
    Uses token-as-username format which works for owners AND collaborators.
    Format: https://{token}@github.com/owner/repo.git
    The oauth2: prefix only works for repo owners in some cases.
    """
    base = _clean_url(url)

    if not token:
        return base + ".git"

    if provider == "github":
        # Use token as username - works for owner, collaborator, org member
        authenticated = base.replace(
            "https://github.com/",
            f"https://{token}@github.com/",
            1,
        )
        return authenticated + ".git"

    if provider == "gitlab":
        # GitLab: oauth2 as username, token as password
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

    if provider == "azure":
        # Azure DevOps uses Basic Auth with any username and PAT as password
        # Format: https://user:{pat}@dev.azure.com/org/project/_git/repo
        authenticated = base.replace(
            "https://dev.azure.com/",
            f"https://SynapseIQ:{token}@dev.azure.com/",
            1,
        )
        return authenticated + ".git"

    return base + ".git"


def extract_repo_name(url: str) -> str:
    """Extract the repository name from a git URL."""
    base = _clean_url(url)
    return base.rstrip("/").split("/")[-1]
