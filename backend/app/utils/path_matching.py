def parse_path_patterns(path_patterns: str | None) -> list[str]:
    if not path_patterns:
        return []
    return [pattern.strip() for pattern in path_patterns.split(",") if pattern.strip()]


def path_matches_patterns(path: str, patterns: list[str]) -> bool:
    return any(path.startswith(pattern) for pattern in patterns)


def count_matching_paths(paths: list[str], patterns: list[str]) -> int:
    return sum(1 for path in paths if path_matches_patterns(path, patterns))
