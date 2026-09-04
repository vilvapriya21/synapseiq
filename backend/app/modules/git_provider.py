"""Utilities for detecting Git providers and constructing authenticated clone URLs."""

import re
from urllib.parse import quote, urlsplit, urlunsplit

PROVIDER_PATTERNS: list[tuple[str, str]] = [
    ("github", r"https?://(www\.)?github\.com/"),
    ("gitlab", r"https?://(www\.)?gitlab\.com/"),
    ("bitbucket", r"https?://(www\.)?bitbucket\.org/"),
    ("azure", r"https?://dev\.azure\.com/"),
    ("azure", r"https?://[a-zA-Z0-9-]+\.visualstudio\.com/"),
]


def detect_provider(url: str) -> str:
    """Detect the Git provider represented by a repository URL.

    Args:
        url: Repository URL or API URL to process.

    Returns:
        Result produced by the operation.
    """
    url = url.strip()
    try:
        hostname = (urlsplit(url).hostname or "").lower()
    except ValueError:
        hostname = ""
    if hostname == "dev.azure.com" or hostname.endswith(".visualstudio.com"):
        return "azure"
    for provider, pattern in PROVIDER_PATTERNS:
        if re.match(pattern, url, re.IGNORECASE):
            return provider
    return "other"


def is_valid_git_url(url: str) -> bool:
    """Return whether a repository URL is a valid HTTPS Git URL.

    Args:
        url: Repository URL or API URL to process.

    Returns:
        Result produced by the operation.
    """
    url = url.strip()
    if not url.startswith("https://"):
        return False
    # Must have a path component after the domain
    without_scheme = url[len("https://"):]
    if "/" not in without_scheme:
        return False
    path = without_scheme.split("/", 1)[1]
    return bool(path.strip("/"))


def is_valid_azure_repo_url(url: str) -> bool:
    """Return whether a URL matches a supported Azure DevOps repository format.

    Args:
        url: Repository URL or API URL to process.

    Returns:
        Result produced by the operation.
    """
    url = normalize_azure_repo_url(url)
    azure_patterns = [
        r"^https://dev\.azure\.com/[^/]+/[^/]+/_git/[^/]+$",
        r"^https://[a-zA-Z0-9-]+\.visualstudio\.com/[^/]+/_git/[^/]+$",
    ]
    return any(re.match(pattern, url, re.IGNORECASE) for pattern in azure_patterns)


def normalize_azure_repo_url(url: str) -> str:
    """Return a canonical Azure DevOps URL without clone-URL user information."""
    base = _clean_url(url)
    try:
        parts = urlsplit(base)
    except ValueError:
        return base
    hostname = parts.hostname or ""
    if not hostname:
        return base
    netloc = hostname
    try:
        port = parts.port
    except ValueError:
        return base
    if port is not None:
        netloc = f"{netloc}:{port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def _clean_url(url: str) -> str:
    """Normalize a repository URL for provider-specific processing.

    Args:
        url: Repository URL to normalize.

    Returns:
        URL without surrounding whitespace, trailing slashes, or a trailing .git suffix.
    """
    url = url.strip()
    url = url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    return url


def build_authenticated_url(url: str, token: str | None, provider: str) -> str:
    """Inject a provider access token into a clone URL.

    Args:
        url: Repository URL to authenticate.
        token: Provider access token or PAT. If omitted, an unauthenticated clone URL is returned.
        provider: Git provider name used to choose the authentication URL format.

    Returns:
        Clone URL formatted for the selected provider.
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
        # Bitbucket OAuth access tokens use x-token-auth format
        authenticated = base.replace(
            "https://bitbucket.org/",
            f"https://x-token-auth:{token}@bitbucket.org/",
            1,
        )
        return authenticated + ".git"

    if provider == "azure":
        # Azure DevOps uses Basic Auth with any username and PAT as password
        # Format: https://user:{pat}@dev.azure.com/org/project/_git/repo
        parts = urlsplit(normalize_azure_repo_url(base))
        authenticated_netloc = f"SynapseIQ:{quote(token, safe='')}@{parts.netloc}"
        return urlunsplit((parts.scheme, authenticated_netloc, parts.path, parts.query, parts.fragment))

    return base + ".git"


def extract_repo_name(url: str) -> str:
    """Extract the repository name from a Git URL.

    Args:
        url: Repository URL to inspect.

    Returns:
        Repository name from the final URL path segment.
    """
    base = _clean_url(url)
    return base.rstrip("/").split("/")[-1]
