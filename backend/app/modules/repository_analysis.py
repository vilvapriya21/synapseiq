from collections import Counter
import ast
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

from sqlalchemy.orm import Session

from app.models.knowledge_base import KnowledgeBase
from app.models.repository import Repository
from app.modules.git_provider import build_authenticated_url


LANGUAGE_EXTENSIONS: dict[str, str] = {
    ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript",
    ".jsx": "JavaScript", ".java": "Java", ".kt": "Kotlin", ".go": "Go",
    ".rs": "Rust", ".cs": "C#", ".cpp": "C++", ".c": "C", ".rb": "Ruby",
    ".php": "PHP", ".swift": "Swift", ".scala": "Scala", ".r": "R", ".sh": "Shell",
}

IGNORED_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv", "env",
    "dist", "build", ".next", ".nuxt", "target", "vendor", ".gradle",
    "coverage", ".pytest_cache", ".mypy_cache", ".idea", ".vscode",
}

DEPENDENCY_FILES = {
    "requirements.txt", "pyproject.toml", "setup.py", "package.json",
    "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "Gemfile",
    "composer.json", "pubspec.yaml",
}


def clone_repository(clone_url: str, target_dir: Path) -> None:
    try:
        subprocess.run(
            ["git", "clone", "--depth=1", "--single-branch", clone_url, str(target_dir)],
            check=True,
            timeout=300,
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


def walk_repo(root: Path) -> list[Path]:
    file_paths: list[Path] = []
    for current_root, dirs, files in os.walk(root):
        dirs[:] = [directory for directory in dirs if directory not in IGNORED_DIRS]
        current_root_path = Path(current_root)
        for filename in files:
            file_paths.append(current_root_path / filename)
    return file_paths


def detect_language(file_paths: list[Path]) -> str | None:
    extension_counts = Counter(
        file_path.suffix.lower()
        for file_path in file_paths
        if file_path.suffix.lower() in LANGUAGE_EXTENSIONS
    )
    if not extension_counts:
        return None

    extension, _ = extension_counts.most_common(1)[0]
    return LANGUAGE_EXTENSIONS[extension]


def count_modules(file_paths: list[Path]) -> int:
    return sum(1 for file_path in file_paths if file_path.suffix.lower() in LANGUAGE_EXTENSIONS)


def extract_file_tree(root: Path, file_paths: list[Path]) -> str:
    lines = [str(file_path.relative_to(root)) for file_path in file_paths[:2000]]
    if len(file_paths) > 2000:
        lines.append("... (truncated)")
    return "\n".join(lines)


def extract_readme(root: Path) -> str | None:
    readme_names = {"readme.md", "readme.rst", "readme.txt"}
    for path in root.iterdir():
        if path.is_file() and path.name.lower() in readme_names:
            return path.read_text(encoding="utf-8", errors="ignore")[:8000]
    return None


def extract_dependencies(root: Path) -> list[tuple[str, str]]:
    dependencies: list[tuple[str, str]] = []
    for path in root.iterdir():
        if path.is_file() and path.name in DEPENDENCY_FILES:
            content = path.read_text(encoding="utf-8", errors="ignore")[:3000]
            dependencies.append((path.name, content))
    return dependencies


def extract_python_signatures(file_path: Path) -> str:
    try:
        source = file_path.read_text(encoding="utf-8", errors="ignore")
        tree = ast.parse(source)
    except Exception:
        return ""

    lines = source.splitlines()
    signatures: list[str] = []
    for item in ast.walk(tree):
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            definition = lines[item.lineno - 1].strip() if item.lineno <= len(lines) else item.name
            docstring = ast.get_docstring(item)
            if docstring:
                definition = f"{definition} # {docstring.splitlines()[0]}"
            signatures.append(definition)

    return "\n".join(signatures)[:4000]


def build_knowledge_base(repository: Repository, root: Path, file_paths: list[Path], db: Session) -> None:
    try:
        repository.knowledge_base_status = "building"
        db.commit()

        db.query(KnowledgeBase).filter(KnowledgeBase.repository_id == repository.id).delete()

        db.add(
            KnowledgeBase(
                repository_id=repository.id,
                entry_type="file_tree",
                content=extract_file_tree(root, file_paths),
            )
        )

        readme = extract_readme(root)
        if readme:
            db.add(
                KnowledgeBase(
                    repository_id=repository.id,
                    entry_type="readme",
                    content=readme,
                )
            )

        for filename, content in extract_dependencies(root):
            db.add(
                KnowledgeBase(
                    repository_id=repository.id,
                    entry_type="dependencies",
                    file_path=filename,
                    content=content,
                )
            )

        if repository.language == "Python":
            python_files = [file_path for file_path in file_paths if file_path.suffix.lower() == ".py"][:50]
            for file_path in python_files:
                sigs = extract_python_signatures(file_path)
                if sigs:
                    db.add(
                        KnowledgeBase(
                            repository_id=repository.id,
                            entry_type="module_summary",
                            file_path=str(file_path.relative_to(root)),
                            content=sigs,
                            language="Python",
                        )
                    )

        repository.knowledge_base_status = "ready"
        db.commit()
    except Exception:
        repository.knowledge_base_status = "error"
        db.commit()


def analyze_repository(repo_id: str, db: Session, github_token: str | None = None) -> None:
    repository = db.get(Repository, repo_id)
    if repository is None:
        return

    repository.status = "indexing"
    repository.error_message = None
    db.commit()

    temp_dir = Path(tempfile.mkdtemp())
    try:
        if repository.source_type == "github" or repository.source_type == "git":
            auth_url = build_authenticated_url(
                repository.url,
                github_token,
                repository.provider,
            )
            clone_repository(auth_url, temp_dir / "repo")
            root = temp_dir / "repo"
        elif repository.source_type == "upload":
            zip_path = Path("uploaded_repos") / f"{repo_id}.zip"
            if not zip_path.exists():
                raise Exception("Uploaded file not found")

            root = temp_dir / "repo"
            with zipfile.ZipFile(zip_path) as zip_file:
                zip_file.extractall(root)

            top_level_items = list(root.iterdir())
            if len(top_level_items) == 1 and top_level_items[0].is_dir():
                root = top_level_items[0]
        else:
            raise Exception(f"Unsupported repository source type: {repository.source_type}")

        file_paths = walk_repo(root)
        language = detect_language(file_paths)
        module_count = count_modules(file_paths)
        file_count = len(file_paths)

        repository.status = "indexed"
        repository.language = language or "Unknown"
        repository.module_count = module_count
        repository.file_count = file_count
        repository.error_message = None
        db.commit()

        build_knowledge_base(
            repository,
            root,
            file_paths,
            db,
        )
    except Exception as exc:
        repository.status = "error"
        repository.error_message = str(exc)[:495]
        db.commit()
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
