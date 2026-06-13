from collections import Counter
import os
from pathlib import Path
import re
import shutil
import tempfile
import zipfile

import chardet
import git
from github import Github
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.repository import Repository


LANGUAGE_EXTENSIONS: dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".jsx": "JavaScript",
    ".java": "Java",
    ".kt": "Kotlin",
    ".go": "Go",
    ".rs": "Rust",
    ".cs": "C#",
    ".cpp": "C++",
    ".c": "C",
    ".rb": "Ruby",
    ".php": "PHP",
    ".swift": "Swift",
    ".scala": "Scala",
    ".r": "R",
    ".sh": "Shell",
}

IGNORED_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "target",
    "vendor",
    ".gradle",
    "coverage",
    ".pytest_cache",
    ".mypy_cache",
}


def detect_language(file_paths: list[str]) -> str | None:
    extension_counts = Counter(
        Path(file_path).suffix.lower()
        for file_path in file_paths
        if Path(file_path).suffix.lower() in LANGUAGE_EXTENSIONS
    )
    if not extension_counts:
        return None

    extension, _ = extension_counts.most_common(1)[0]
    return LANGUAGE_EXTENSIONS[extension]


def count_modules_from_paths(file_paths: list[str]) -> int:
    return sum(1 for file_path in file_paths if Path(file_path).suffix.lower() in LANGUAGE_EXTENSIONS)


def parse_github_repo_path(url: str) -> str:
    repo_path = re.sub(r"^https://github\.com/", "", url.strip())
    repo_path = repo_path.rstrip("/")
    if repo_path.endswith(".git"):
        repo_path = repo_path[:-4]
    return repo_path


def collect_uploaded_paths(extract_dir: Path) -> list[str]:
    file_paths: list[str] = []
    for root, dirs, files in os.walk(extract_dir):
        dirs[:] = [directory for directory in dirs if directory not in IGNORED_DIRS]
        root_path = Path(root)
        for filename in files:
            file_paths.append(str((root_path / filename).relative_to(extract_dir)))
    return file_paths


def analyze_github_repository(repository: Repository) -> tuple[str | None, int]:
    gh = Github(settings.github_token) if settings.github_token else Github()
    repo_path = parse_github_repo_path(repository.url or "")
    gh_repo = gh.get_repo(repo_path)
    tree = gh_repo.get_git_tree(repository.branch or "main", recursive=True)
    file_paths = [item.path for item in tree.tree if item.type == "blob" and item.path]
    language = detect_language(file_paths) or gh_repo.language
    module_count = count_modules_from_paths(file_paths)
    return language, module_count


def analyze_uploaded_repository(repo_id: str) -> tuple[str | None, int]:
    upload_path = Path("uploaded_repos") / f"{repo_id}.zip"
    if not upload_path.exists():
        raise Exception("Uploaded file not found")

    temp_dir = Path(tempfile.mkdtemp())
    try:
        with zipfile.ZipFile(upload_path) as zip_file:
            zip_file.extractall(temp_dir)
        file_paths = collect_uploaded_paths(temp_dir)
        language = detect_language(file_paths)
        module_count = count_modules_from_paths(file_paths)
        return language, module_count
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def analyze_repository(repo_id: str, db: Session) -> None:
    _ = chardet, git
    repository = db.get(Repository, repo_id)
    if repository is None:
        return

    repository.status = "indexing"
    repository.error_message = None
    db.commit()

    try:
        if repository.source_type == "github":
            language, module_count = analyze_github_repository(repository)
        elif repository.source_type == "upload":
            language, module_count = analyze_uploaded_repository(repo_id)
        else:
            raise Exception(f"Unsupported repository source type: {repository.source_type}")

        repository.status = "indexed"
        repository.language = language or "Unknown"
        repository.module_count = module_count
        repository.error_message = None
        db.commit()
    except Exception as exc:
        repository.status = "error"
        repository.error_message = str(exc)[:495]
        db.commit()
