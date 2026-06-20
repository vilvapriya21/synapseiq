"""Path-pattern parsing and matching helpers for repository files."""

def parse_path_patterns(path_patterns: str | None) -> list[str]:
    """Parse path patterns into structured data.

    Args:
        path_patterns: path_patterns value used by the operation.

    Returns:
        Result produced by the operation.
    """
    if not path_patterns:
        return []
    return [pattern.strip().replace("\\", "/").strip("/") for pattern in path_patterns.split(",") if pattern.strip()]


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


def count_matching_paths(paths: list[str], patterns: list[str]) -> int:
    """Handle count matching paths for the current operation.

    Args:
        paths: Path values to compare against configured patterns.
        patterns: Path patterns used for matching.

    Returns:
        Result produced by the operation.
    """
    return sum(1 for path in paths if path_matches_patterns(path, patterns))
