"""Path-pattern parsing and matching helpers for repository files."""

import logging
import re


logger = logging.getLogger(__name__)

_URL_TREE_RE = re.compile(
    r"^https?://(?:github\.com|gitlab\.com|bitbucket\.org|dev\.azure\.com)/"
    r".+?/(?:tree|blob|src|browse)/[^/]+/(?P<path>.+)$"
)
_KNOWN_GIT_HOST_URL_RE = re.compile(
    r"^https?://(?:github\.com|gitlab\.com|bitbucket\.org|dev\.azure\.com)(?:/.*)?$"
)
_REPOSITORY_LEARNING_TOPIC_MARKER = "__repository_current_learning__"


def _strip_url_suffix(path: str) -> str:
    """Remove URL query or fragment suffixes from a captured path."""
    return path.split("?", 1)[0].split("#", 1)[0]


def normalize_path_pattern(pattern: str) -> str:
    """Normalize a single path pattern or known git-host folder URL.

    Args:
        pattern: Path pattern or pasted repository URL.

    Returns:
        A repository-relative path pattern, or an empty string when no specific path can be inferred.
    """
    raw_pattern = pattern.strip()
    if not raw_pattern:
        return ""
    if raw_pattern == _REPOSITORY_LEARNING_TOPIC_MARKER:
        return raw_pattern

    url_match = _URL_TREE_RE.match(raw_pattern)
    if url_match:
        raw_pattern = _strip_url_suffix(url_match.group("path"))
    elif _KNOWN_GIT_HOST_URL_RE.match(raw_pattern):
        logger.warning("Ignoring repository URL path pattern without a tree/blob/src/browse path: %s", raw_pattern)
        return ""

    return raw_pattern.replace("\\", "/").strip("/")


def normalize_path_patterns(path_patterns: str | None) -> str | None:
    """Normalize path patterns for storage.

    Args:
        path_patterns: Comma-separated path patterns or pasted git-host URLs.

    Returns:
        Comma-separated normalized patterns, or None if no specific pattern remains.
    """
    patterns = parse_path_patterns(path_patterns)
    if not patterns:
        return None
    return ", ".join(patterns)


def parse_path_patterns(path_patterns: str | None) -> list[str]:
    """Parse path patterns into structured data.

    Args:
        path_patterns: path_patterns value used by the operation.

    Returns:
        Result produced by the operation.
    """
    if not path_patterns:
        return []
    return [
        normalized
        for pattern in path_patterns.split(",")
        if pattern.strip()
        for normalized in [normalize_path_pattern(pattern)]
        if normalized
    ]


def path_matches_patterns(path: str, patterns: list[str]) -> bool:
    """Handle path matches patterns for the current operation.

    Args:
        path: Path value to compare against configured patterns.
        patterns: Path patterns used for matching.

    Returns:
        Result produced by the operation.
    """
    normalized_path = path.replace("\\", "/").strip("/")
    return any(
        normalized_path == pattern
        or normalized_path.startswith(f"{pattern}/")
        or f"/{pattern}/" in f"/{normalized_path}/"
        for pattern in patterns
    )


def filter_matching_path_lines(content: str, patterns: list[str]) -> list[str]:
    """Return file-tree lines that match the supplied path patterns.

    Args:
        content: File-tree text with one repository-relative path per line.
        patterns: Path patterns used for matching.

    Returns:
        Matching normalized path lines.
    """
    matches: list[str] = []
    for line in content.splitlines():
        path = line.strip()
        if path and path_matches_patterns(path, patterns):
            matches.append(path.replace("\\", "/"))
    return matches


def count_matching_paths(paths: list[str], patterns: list[str]) -> int:
    """Handle count matching paths for the current operation.

    Args:
        paths: Path values to compare against configured patterns.
        patterns: Path patterns used for matching.

    Returns:
        Result produced by the operation.
    """
    return sum(1 for path in paths if path_matches_patterns(path, patterns))
