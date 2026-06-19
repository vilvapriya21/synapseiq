from collections import Counter
import ast
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from typing import Callable
import zipfile

from sqlalchemy.orm import Session

from app.models.knowledge_base import KnowledgeBase
from app.models.repository import Repository
from app.modules.git_provider import build_authenticated_url


def mask_credentials(url: str) -> str:
    return re.sub(r"(https://[^:@/]+:)[^@/]+(@)", r"\1***\2", url)


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

TEXT_FILE_EXTENSIONS = {
    ".bat", ".c", ".cfg", ".cmake", ".cpp", ".cs", ".css", ".csv", ".dart",
    ".env", ".go", ".gradle", ".h", ".html", ".ini", ".java", ".js", ".json",
    ".jsx", ".kt", ".lock", ".md", ".php", ".properties", ".py", ".r", ".rb",
    ".rs", ".rst", ".scala", ".sh", ".sql", ".swift", ".toml", ".ts", ".tsx",
    ".txt", ".xml", ".yaml", ".yml",
}

IMAGE_FILE_EXTENSIONS = {
    ".avif", ".bmp", ".gif", ".ico", ".jpg", ".jpeg", ".png", ".svg", ".webp",
}

MAX_TEXT_FILE_BYTES = 500_000
MAX_IMAGE_FILE_BYTES = 5_000_000
REPOSITORY_STORAGE_DIR = Path("uploads") / "repositories"


def clone_repository(clone_url: str, target_dir: Path, branch: str | None = None, provider: str | None = None) -> None:
    command = ["git", "clone", "--depth=1", "--single-branch"]
    if branch:
        command.extend(["--branch", branch])
    command.extend([clone_url, str(target_dir)])
    print(f"[CLONE] target_dir={target_dir}")
    print(f"[CLONE] target_dir_exists_before={target_dir.exists()}")
    branch_part = f"--branch {branch} " if branch else ""
    print(f"[CLONE] command=git clone --depth=1 --single-branch {branch_part}{mask_credentials(clone_url)} {target_dir}")
    try:
        result = subprocess.run(
            command,
            check=True,
            timeout=300,
            capture_output=True,
            text=True,
        )
        print(f"[CLONE] success return_code={result.returncode}")
        print(f"[CLONE] stdout={result.stdout}")
        print(f"[CLONE] stderr={result.stderr}")
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr or ""
        print(f"[ERROR] git clone failed return_code={exc.returncode}")
        print(f"[ERROR] git clone stdout={exc.stdout}")
        print(f"[ERROR] git clone stderr={stderr}")
        if provider == "azure":
            print("[ERROR] clone_reason=azure_clone_failed")
            raise Exception("Unable to clone Azure DevOps repository. Check PAT permissions, repo URL, and branch.")
        if "Authentication failed" in stderr:
            print("[ERROR] clone_reason=authentication_failed")
            raise Exception("Authentication failed. Connect your GitHub account and try again.")
        if "Repository not found" in stderr or "not found" in stderr:
            print("[ERROR] clone_reason=repository_not_found_or_access_denied")
            raise Exception(
                "Repository not found. Check the URL or connect your account to access private repositories."
            )
        if "could not resolve host" in stderr:
            print("[ERROR] clone_reason=network_or_dns_failure")
            raise Exception("Could not reach the git server. Check the URL.")
        print("[ERROR] clone_reason=unknown_git_clone_error")
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


def is_text_file(file_path: Path) -> bool:
    return file_path.suffix.lower() in TEXT_FILE_EXTENSIONS


def is_image_file(file_path: Path) -> bool:
    return file_path.suffix.lower() in IMAGE_FILE_EXTENSIONS


def persist_repository_files(root: Path, repo_id: str) -> None:
    destination = REPOSITORY_STORAGE_DIR / repo_id
    REPOSITORY_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        shutil.rmtree(destination)

    shutil.copytree(
        root,
        destination,
        ignore=shutil.ignore_patterns(".git"),
    )


def extract_python_signatures(file_path: Path) -> str:
    try:
        source = file_path.read_text(encoding="utf-8", errors="ignore")
        tree = ast.parse(source)
    except Exception:
        print(f"[ERROR] Python signature extraction failed for {file_path}")
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


def extract_csharp_signatures(file_path: Path) -> str:
    try:
        source = file_path.read_text(encoding="utf-8", errors="ignore")
        class_pattern = r"^\s*(?:public|private|internal|protected)?\s*(?:static\s+|abstract\s+|sealed\s+|partial\s+)*(?:class|interface|record|struct)\s+\w+[^\{]*"
        method_pattern = r"^\s*(?:public|private|internal|protected)\s+(?:static\s+|async\s+|virtual\s+|override\s+)*[\w<>\[\],\.\?]+\s+\w+\s*\([^)]*\)\s*\{?"
        property_pattern = r"^\s*(?:public|private|internal|protected)\s+[\w<>\[\],\.\?]+\s+\w+\s*\{\s*get;"
        matches = (
            re.findall(class_pattern, source, re.MULTILINE)
            + re.findall(method_pattern, source, re.MULTILINE)
            + re.findall(property_pattern, source, re.MULTILINE)
        )
        signatures = [match.strip().rstrip("{").strip() for match in matches]
        return "\n".join(signatures)[:4000]
    except Exception:
        return ""


def classify_aspnet_role(file_path: Path, content: str) -> str | None:
    try:
        if file_path.name.endswith("Controller.cs") and (
            "ControllerBase" in content or ": Controller" in content
        ):
            return "controller"
        if "DbContext" in content and "class" in content:
            return "dbcontext"
        if "Models" in file_path.parts or "Models" in str(file_path):
            return "model"
        if file_path.suffix == ".cshtml":
            return "view"
        return None
    except Exception:
        return None


def extract_dart_signatures(file_path: Path) -> str:
    try:
        source = file_path.read_text(encoding="utf-8", errors="ignore")
        class_pattern = r"^\s*(abstract\s+)?class\s+\w+[^\{]*"
        method_pattern = r"^\s*(?:@override\s+)?(?:Future<[\w<>]+>|void|int|String|bool|double|var|dynamic|Widget)\s+\w+\s*\([^)]*\)\s*(?:async\s*)?\{?"
        class_matches = [
            match[0] for match in re.findall(f"({class_pattern})", source, re.MULTILINE)
        ]
        matches = class_matches + re.findall(
            method_pattern, source, re.MULTILINE
        )
        signatures = [match.strip().rstrip("{").strip() for match in matches]
        return "\n".join(signatures)[:4000]
    except Exception:
        return ""


def extract_js_ts_signatures(file_path: Path) -> str:
    try:
        source = file_path.read_text(encoding="utf-8", errors="ignore")
        function_pattern = r"^\s*(?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)"
        arrow_const_pattern = r"^\s*(?:export\s+)?const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*\w+\s*)?=>"
        class_pattern = r"^\s*(?:export\s+)?(?:default\s+)?class\s+\w+[^\{]*"
        interface_pattern = r"^\s*(?:export\s+)?interface\s+\w+[^\{]*"
        react_component_pattern = r"^\s*(?:export\s+)?const\s+\w+\s*:\s*(?:React\.)?(?:FC|FunctionComponent)<[^>]+>\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*(?:JSX\.Element|React\.Element|ReactNode|Element)\s*)?=>"
        matches = (
            re.findall(function_pattern, source, re.MULTILINE)
            + re.findall(arrow_const_pattern, source, re.MULTILINE)
            + re.findall(class_pattern, source, re.MULTILINE)
            + re.findall(interface_pattern, source, re.MULTILINE)
            + re.findall(react_component_pattern, source, re.MULTILINE)
        )
        signatures = [match.strip() for match in matches]
        return "\n".join(signatures)[:4000]
    except Exception:
        return ""


def extract_java_kotlin_signatures(file_path: Path) -> str:
    try:
        source = file_path.read_text(encoding="utf-8", errors="ignore")
        class_pattern = r"^\s*(?:public\s+|private\s+|internal\s+)?(?:abstract\s+|open\s+|data\s+|sealed\s+)?(?:class|interface|object)\s+\w+[^\{]*"
        method_pattern = r"^\s*(?:public\s+|private\s+|protected\s+|internal\s+|fun\s+|override\s+)+[\w<>\[\],?\s]*?\b\w+\s*\([^)]*\)\s*(?::\s*[\w<>\[\],?]+\s*)?\{?"
        matches = re.findall(class_pattern, source, re.MULTILINE) + re.findall(
            method_pattern, source, re.MULTILINE
        )
        signatures = [match.strip() for match in matches]
        return "\n".join(signatures)[:4000]
    except Exception:
        return ""


SIGNATURE_EXTRACTORS: dict[str, tuple[Callable[[Path], str], tuple[str, ...]]] = {
    "Python": (extract_python_signatures, (".py",)),
    "C#": (extract_csharp_signatures, (".cs",)),
    "Dart": (extract_dart_signatures, (".dart",)),
    "JavaScript": (extract_js_ts_signatures, (".js", ".jsx")),
    "TypeScript": (extract_js_ts_signatures, (".ts", ".tsx")),
    "Java": (extract_java_kotlin_signatures, (".java",)),
    "Kotlin": (extract_java_kotlin_signatures, (".kt",)),
}


def build_knowledge_base(repository: Repository, root: Path, file_paths: list[Path], db: Session) -> None:
    try:
        print(f"[KNOWLEDGE_BASE] building repository_id={repository.id} root={root} files={len(file_paths)}")
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

        extractor_entry = SIGNATURE_EXTRACTORS.get(repository.language)
        if extractor_entry:
            extractor_fn, extensions = extractor_entry
            matching_files = [
                file_path for file_path in file_paths
                if file_path.suffix.lower() in extensions
            ][:50]
            for file_path in matching_files:
                sigs = extractor_fn(file_path)
                if not sigs:
                    continue
                content = sigs
                if repository.language == "C#":
                    try:
                        raw_text = file_path.read_text(encoding="utf-8", errors="ignore")
                        role = classify_aspnet_role(file_path, raw_text)
                        if role:
                            content = f"[{role.upper()}]\n{sigs}"
                    except Exception:
                        pass
                db.add(
                    KnowledgeBase(
                        repository_id=repository.id,
                        entry_type="module_summary",
                        file_path=str(file_path.relative_to(root)),
                        content=content,
                        language=repository.language,
                    )
                )

        repository.knowledge_base_status = "ready"
        db.commit()
        print(f"[KNOWLEDGE_BASE] ready repository_id={repository.id}")
    except Exception as exc:
        print(f"[ERROR] knowledge_base_failed repository_id={repository.id} reason={exc}")
        repository.knowledge_base_status = "error"
        db.commit()


def analyze_repository(
    repo_id: str,
    db: Session,
    github_token: str | None = None,
    azure_token: str | None = None,
    gitlab_token: str | None = None,
    bitbucket_token: str | None = None,
) -> None:
    print(f"[REPO_ANALYSIS] start repo_id={repo_id}")
    repository = db.get(Repository, repo_id)
    if repository is None:
        print(f"[ERROR] repository_not_found repo_id={repo_id}")
        return

    print(
        "[REPO_ANALYSIS] loaded "
        f"id={repository.id} source_type={repository.source_type} provider={repository.provider} "
        f"url={repository.url} branch={repository.branch} status={repository.status} "
        f"github_token_present={bool(github_token)}"
    )
    repository.status = "indexing"
    repository.error_message = None
    db.commit()
    print(f"[REPO_ANALYSIS] status=indexing repo_id={repo_id}")

    temp_dir = Path(tempfile.mkdtemp())
    try:
        if repository.source_type == "github" or repository.source_type == "git":
            print(f"[AUTH] building_authenticated_url repo_id={repo_id}")
            token_map = {
                "github": github_token,
                "azure": azure_token,
                "gitlab": gitlab_token,
                "bitbucket": bitbucket_token,
            }
            token_for_provider = token_map.get(repository.provider)
            if repository.provider == "azure" and not token_for_provider:
                raise Exception("Please save Azure DevOps PAT before connecting a repository.")
            auth_url = build_authenticated_url(
                repository.url,
                token_for_provider,
                repository.provider,
            )
            print(f"[AUTH] authenticated_url={mask_credentials(auth_url)} credentials_injected={'@' in auth_url.split('://', 1)[-1].split('/', 1)[0]}")
            print(f"[CLONE] before_clone repo_id={repo_id}")
            clone_repository(auth_url, temp_dir / "repo", repository.branch, repository.provider)
            print(f"[CLONE] after_clone_success repo_id={repo_id}")
            root = temp_dir / "repo"
        elif repository.source_type == "upload":
            zip_path = Path("uploaded_repos") / f"{repo_id}.zip"
            print(f"[REPO_ANALYSIS] upload_zip_path={zip_path} exists={zip_path.exists()}")
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
        print(
            f"[REPO_ANALYSIS] analyzed repo_id={repo_id} language={language or 'Unknown'} "
            f"module_count={module_count} file_count={file_count}"
        )
        persist_repository_files(root, repo_id)
        print(f"[REPO_ANALYSIS] persisted repo_id={repo_id} path={REPOSITORY_STORAGE_DIR / repo_id}")

        repository.status = "indexed"
        repository.language = language or "Unknown"
        repository.module_count = module_count
        repository.file_count = file_count
        repository.error_message = None
        db.commit()
        print(f"[REPO_ANALYSIS] status=indexed repo_id={repo_id}")

        build_knowledge_base(
            repository,
            root,
            file_paths,
            db,
        )
        if repository.source_type == "upload":
            # Clean up the uploaded ZIP — we've extracted what we need into the knowledge base
            upload_path = Path("uploaded_repos") / f"{repo_id}.zip"
            if upload_path.exists():
                try:
                    upload_path.unlink()
                except OSError:
                    pass  # Non-critical — don't fail the analysis if cleanup fails
    except Exception as exc:
        print(f"[ERROR] repository_analysis_failed repo_id={repo_id} reason={exc}")
        repository.status = "error"
        repository.error_message = str(exc)[:495]
        db.commit()
        print(f"[ERROR] repository_status=error repo_id={repo_id} error_message={repository.error_message}")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        print(f"[REPO_ANALYSIS] cleanup_complete repo_id={repo_id} temp_dir={temp_dir}")
