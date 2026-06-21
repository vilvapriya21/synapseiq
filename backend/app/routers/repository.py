"""API endpoints for repository onboarding, indexing, and file access."""

from base64 import b64encode
from datetime import datetime, timezone
import json
import mimetypes
from pathlib import Path
import shutil
import subprocess
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.orm import Session as DbSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.chat_message import ChatMessage
from app.models.contributor import Contributor
from app.models.knowledge_base import KnowledgeBase
from app.models.kt_checklist import KTChecklistItem, KTChecklistProgress
from app.models.kt_topic import KTTopic
from app.models.repository import Repository
from app.models.repository_assignment import RepositoryAssignment
from app.models.user import User
from app.modules.contributor_analysis import analyze_contributors
from app.modules.git_provider import (
    build_authenticated_url,
    detect_provider,
    extract_repo_name,
    is_valid_azure_repo_url,
    is_valid_git_url,
    normalize_azure_repo_url,
)
from app.modules.repository_analysis import (
    IMAGE_FILE_EXTENSIONS,
    MAX_IMAGE_FILE_BYTES,
    MAX_TEXT_FILE_BYTES,
    REPOSITORY_STORAGE_DIR,
    analyze_repository,
)
from app.schemas.repository import (
    AssignmentListResponse,
    AssignmentResponse,
    AssignLearnerRequest,
    ContributorListResponse,
    KnowledgeBaseResponse,
    MyAssignmentResponse,
    RepositoryFileResponse,
    RepositoryUploadListResponse,
    RepositoryUploadResponse,
    RepositoryConnectRequest,
    RepositoryListResponse,
    RepositoryResponse,
)

router = APIRouter()

MAX_UPLOAD_SIZE_BYTES = 2_000_000_000
MAX_NOTEBOOK_PREVIEW_BYTES = 20_000_000
UPLOAD_DIR = Path("uploaded_repos")
DOCUMENT_UPLOAD_DIR = Path("uploads") / "documents"
MAX_DOCUMENT_UPLOAD_SIZE_BYTES = 100_000_000
REPOSITORY_LEARNING_TOPIC_MARKER = "__repository_current_learning__"


class AssignKtProviderRequest(BaseModel):
    """Request to assign a registered contributor as a KT provider."""

    contributor_email: str
    kt_topic_id: str

PROVIDER_LABELS = {
    "github": "GitHub",
    "gitlab": "GitLab",
    "bitbucket": "Bitbucket",
    "azure": "Azure DevOps",
}

AUTH_ERROR_MARKERS = (
    "authentication failed",
    "could not read username",
    "could not read password",
    "invalid username or password",
    "invalid credentials",
    "access denied",
    "unauthorized",
    "authorization failed",
    "repository not found",
    "authentication required",
    "fatal: authentication",
    "remote: invalid username or password",
    "remote: HTTP Basic: Access denied",
    "remote: You may not have access",
    "TF401019",
)


def is_admin(user: User) -> bool:
    """Return whether the user has the admin role.

    Args:
        user: user value used by the operation.

    Returns:
        Result produced by the operation.
    """
    return user.role.lower() == "admin"


def is_learner(user: User) -> bool:
    """Return whether the user has a learner-compatible role.

    Args:
        user: user value used by the operation.

    Returns:
        Result produced by the operation.
    """
    return user.role.lower() in {"learner", "user"}


def get_provider_token(user: User, provider: str) -> str | None:
    """Return the provider token for the current operation.

    Args:
        user: user value used by the operation.
        provider: Git provider name.

    Returns:
        Result produced by the operation.
    """
    if provider == "github":
        return user.github_access_token
    if provider == "gitlab":
        return user.gitlab_access_token
    if provider == "bitbucket":
        return user.bitbucket_access_token
    if provider == "azure":
        return user.azure_devops_token
    return None


def auth_error_detail(code: str, provider: str) -> dict[str, str]:
    """Handle auth error detail for the current operation.

    Args:
        code: code value used by the operation.
        provider: Git provider name.

    Returns:
        Result produced by the operation.
    """
    label = PROVIDER_LABELS.get(provider, provider.title())
    if code == "AUTH_REQUIRED":
        action = "refreshing this repository"
    else:
        action = "refreshing this repository. Please reconnect and try again"
    return {
        "code": code,
        "provider": provider,
        "message": f"{label} authentication required before {action}.",
    }


def is_auth_failure(output: str) -> bool:
    """Handle is auth failure for the current operation.

    Args:
        output: output value used by the operation.

    Returns:
        Result produced by the operation.
    """
    output_lower = output.lower()
    return any(marker.lower() in output_lower for marker in AUTH_ERROR_MARKERS)


def validate_refresh_auth(repository: Repository, current_user: User) -> None:
    """Validate refresh auth for the current operation.

    Args:
        repository: Repository model being read or updated.
        current_user: Authenticated user associated with the request.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if repository.source_type != "git":
        return

    provider = (repository.provider or detect_provider(repository.url or "")).lower()
    if provider not in PROVIDER_LABELS:
        return

    token = get_provider_token(current_user, provider)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=auth_error_detail("AUTH_REQUIRED", provider),
        )

    authenticated_url = build_authenticated_url(repository.url or "", token, provider)
    try:
        subprocess.run(
            ["git", "ls-remote", "--heads", authenticated_url],
            check=True,
            timeout=60,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        output = f"{exc.stdout or ''}\n{exc.stderr or ''}"
        if is_auth_failure(output):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=auth_error_detail("AUTH_INVALID", provider),
            ) from exc
    except subprocess.TimeoutExpired as exc:
        output = f"{exc.stdout or ''}\n{exc.stderr or ''}"
        if is_auth_failure(output):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=auth_error_detail("AUTH_INVALID", provider),
            ) from exc
    except OSError:
        return


def get_repository_name_from_filename(filename: str) -> str:
    """Return the repository name from filename for the current operation.

    Args:
        filename: filename value used by the operation.

    Returns:
        Result produced by the operation.
    """
    name = Path(filename).name
    if name.lower().endswith(".zip"):
        return name[:-4]
    return name


def get_upload_size(file: UploadFile) -> int:
    """Return the upload size for the current operation.

    Args:
        file: Uploaded file supplied by the client.

    Returns:
        Result produced by the operation.
    """
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    return size


def get_repository_document_dir(repo_id: str) -> Path:
    """Return the repository document dir for the current operation.

    Args:
        repo_id: Repository identifier.

    Returns:
        Result produced by the operation.
    """
    return DOCUMENT_UPLOAD_DIR / repo_id


def get_repository_upload_manifest_path(repo_id: str) -> Path:
    """Return the repository upload manifest path for the current operation.

    Args:
        repo_id: Repository identifier.

    Returns:
        Result produced by the operation.
    """
    return get_repository_document_dir(repo_id) / "manifest.json"


def read_repository_upload_manifest(repo_id: str) -> list[dict]:
    """Handle read repository upload manifest for the current operation.

    Args:
        repo_id: Repository identifier.

    Returns:
        Result produced by the operation.
    """
    manifest_path = get_repository_upload_manifest_path(repo_id)
    if not manifest_path.exists():
        return []

    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def write_repository_upload_manifest(repo_id: str, uploads: list[dict]) -> None:
    """Handle write repository upload manifest for the current operation.

    Args:
        repo_id: Repository identifier.
        uploads: uploads value used by the operation.
    """
    upload_dir = get_repository_document_dir(repo_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    get_repository_upload_manifest_path(repo_id).write_text(
        json.dumps(uploads, indent=2),
        encoding="utf-8",
    )


def get_repository_upload_file_path(repo_id: str, upload_id: str) -> Path:
    """Return the repository upload file path for the current operation.

    Args:
        repo_id: Repository identifier.
        upload_id: upload_id value used by the operation.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    root = get_repository_document_dir(repo_id).resolve()
    requested = (root / upload_id).resolve()

    try:
        requested.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid upload id") from exc

    return requested


def to_repository_upload_response(upload: dict) -> RepositoryUploadResponse:
    """Handle to repository upload response for the current operation.

    Args:
        upload: upload value used by the operation.

    Returns:
        Result produced by the operation.
    """
    return RepositoryUploadResponse(
        id=upload["id"],
        filename=upload["filename"],
        content_type=upload.get("content_type"),
        size=upload["size"],
        uploaded_at=datetime.fromisoformat(upload["uploaded_at"]),
        uploaded_by=upload["uploaded_by"],
    )


def get_owned_repository(db: DbSession, repo_id: str, owner_id: str) -> Repository:
    """Return the owned repository for the current operation.

    Args:
        db: Database session used for persistence and queries.
        repo_id: Repository identifier.
        owner_id: owner_id value used by the operation.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    repository = db.scalar(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.owner_id == owner_id,
        )
    )
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return repository


def get_accessible_repository(db: DbSession, repo_id: str, current_user: User) -> Repository:
    """Return the accessible repository for the current operation.

    Args:
        db: Database session used for persistence and queries.
        repo_id: Repository identifier.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if is_admin(current_user):
        return get_owned_repository(db, repo_id, current_user.id)

    if is_learner(current_user):
        assignment = db.scalar(
            select(RepositoryAssignment).where(
                RepositoryAssignment.repository_id == repo_id,
                RepositoryAssignment.learner_id == current_user.id,
            )
        )
        if assignment is not None:
            repository = db.get(Repository, repo_id)
            if repository is not None:
                return repository

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")


def get_or_create_repository_learning_topic(
    db: DbSession,
    repository: Repository,
    current_user: User,
) -> KTTopic:
    """Return the or create repository learning topic for the current operation.

    Args:
        db: Database session used for persistence and queries.
        repository: Repository model being read or updated.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    topic = db.scalar(
        select(KTTopic).where(
            KTTopic.repository_id == repository.id,
            KTTopic.path_patterns == REPOSITORY_LEARNING_TOPIC_MARKER,
        )
    )
    if topic is not None:
        return topic

    topic = KTTopic(
        repository_id=repository.id,
        title=repository.name,
        description=None,
        path_patterns=REPOSITORY_LEARNING_TOPIC_MARKER,
        created_by=current_user.id,
    )
    db.add(topic)
    db.flush()
    return topic


@router.post("/connect", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
def connect_repository(
    payload: RepositoryConnectRequest,
    background_tasks: BackgroundTasks,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Repository:
    """Handle connect repository for the current operation.

    Args:
        payload: Validated request body for the operation.
        background_tasks: FastAPI background task manager used to schedule asynchronous work.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if not is_valid_git_url(payload.url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid git repository URL starting with https://",
        )
    provider_hint = (payload.provider or payload.source_type or "").strip().lower()
    detected_provider = detect_provider(payload.url)
    provider = "azure" if provider_hint == "azure" else detected_provider

    if provider == "azure":
        if not is_valid_azure_repo_url(payload.url):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Please enter a valid Azure DevOps repository URL in the format "
                    "https://dev.azure.com/org/project/_git/repo or "
                    "https://org.visualstudio.com/project/_git/repo."
                ),
            )
        if not current_user.azure_devops_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please save Azure DevOps PAT before connecting a repository.",
            )
        payload.url = normalize_azure_repo_url(payload.url)

    existing_repository = db.scalar(
        select(Repository).where(
            Repository.owner_id == current_user.id,
            Repository.url == payload.url,
        )
    )
    if existing_repository is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repository already exists for this user")

    repository = Repository(
        name=extract_repo_name(payload.url),
        source_type="git",
        provider=provider,
        url=payload.url,
        branch=payload.branch,
        status="pending",
        owner_id=current_user.id,
    )
    db.add(repository)
    db.commit()
    db.refresh(repository)
    background_tasks.add_task(
        analyze_repository,
        repository.id,
        db,
        current_user.github_access_token,
        current_user.azure_devops_token,
        current_user.gitlab_access_token,
        current_user.bitbucket_access_token,
    )
    return repository


@router.post("/upload", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
def upload_repository(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Repository:
    """Handle upload repository for the current operation.

    Args:
        background_tasks: FastAPI background task manager used to schedule asynchronous work.
        file: Uploaded file supplied by the client.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    filename = file.filename or ""
    if file.content_type != "application/zip" and not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only ZIP uploads are supported")

    if get_upload_size(file) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Uploaded file exceeds 2GB")

    repository = Repository(
        name=get_repository_name_from_filename(filename),
        source_type="upload",
        provider="upload",
        url=None,
        branch=None,
        status="pending",
        owner_id=current_user.id,
    )
    db.add(repository)
    db.flush()

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    upload_path = UPLOAD_DIR / f"{repository.id}.zip"
    with upload_path.open("wb") as destination:
        shutil.copyfileobj(file.file, destination)

    db.commit()
    db.refresh(repository)
    background_tasks.add_task(analyze_repository, repository.id, db, current_user.github_access_token)
    return repository


@router.get("", response_model=RepositoryListResponse)
def list_repositories(
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RepositoryListResponse:
    """List repositories for the current user.

    Args:
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    repositories = db.scalars(
        select(Repository)
        .where(Repository.owner_id == current_user.id)
        .order_by(Repository.created_at.desc())
    ).all()

    return RepositoryListResponse(repositories=repositories, total=len(repositories))


@router.get("/assigned-to-me", response_model=list[MyAssignmentResponse])
def get_my_assignments(
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MyAssignmentResponse]:
    """Return the my assignments for the current operation.

    Args:
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    rows = db.scalars(select(RepositoryAssignment).where(RepositoryAssignment.learner_id == current_user.id)).all()
    results = []
    for a in rows:
        repo = db.get(Repository, a.repository_id)
        topic = db.get(KTTopic, a.kt_topic_id)
        is_repository_learning = topic and topic.path_patterns == REPOSITORY_LEARNING_TOPIC_MARKER
        if is_repository_learning or a.status == "kt_provider_assigned":
            continue
        results.append(MyAssignmentResponse(
            assignment_id=a.id,
            repository_id=a.repository_id,
            repository_name=repo.name if repo else "Unknown",
            kt_topic_id=a.kt_topic_id,
            kt_topic_title=None if is_repository_learning else topic.title if topic else None,
            kt_topic_description=None if is_repository_learning else topic.description if topic else None,
            status=a.status,
            assigned_at=a.assigned_at,
        ))
    return results


@router.get("/my-kt-provider-assignments", response_model=list[MyAssignmentResponse])
def get_my_kt_provider_assignments(
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MyAssignmentResponse]:
    """Return KT topics the current user has been assigned to deliver."""
    rows = db.scalars(
        select(RepositoryAssignment).where(
            RepositoryAssignment.learner_id == current_user.id,
            RepositoryAssignment.status == "kt_provider_assigned",
        )
    ).all()
    results = []
    for assignment in rows:
        repository = db.get(Repository, assignment.repository_id)
        topic = db.get(KTTopic, assignment.kt_topic_id)
        results.append(MyAssignmentResponse(
            assignment_id=assignment.id,
            repository_id=assignment.repository_id,
            repository_name=repository.name if repository else "Unknown",
            kt_topic_id=assignment.kt_topic_id,
            kt_topic_title=topic.title if topic else None,
            kt_topic_description=topic.description if topic else None,
            status=assignment.status,
            assigned_at=assignment.assigned_at,
        ))
    return results


@router.get("/assigned", response_model=RepositoryListResponse)
def get_assigned_repositories(
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RepositoryListResponse:
    """Return the assigned repositories for the current operation.

    Args:
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    rows = db.scalars(select(RepositoryAssignment).where(RepositoryAssignment.learner_id == current_user.id)).all()
    repository_ids = list(dict.fromkeys(row.repository_id for row in rows))
    if not repository_ids:
        return RepositoryListResponse(repositories=[], total=0)

    repositories = db.scalars(
        select(Repository)
        .where(Repository.id.in_(repository_ids))
        .order_by(Repository.created_at.desc())
    ).all()
    return RepositoryListResponse(repositories=repositories, total=len(repositories))


@router.post("/{repo_id}/refresh", response_model=RepositoryResponse)
def refresh_repository(
    repo_id: str,
    background_tasks: BackgroundTasks,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Repository:
    """Handle refresh repository for the current operation.

    Args:
        repo_id: Repository identifier.
        background_tasks: FastAPI background task manager used to schedule asynchronous work.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    repository = get_owned_repository(db, repo_id, current_user.id)
    validate_refresh_auth(repository, current_user)

    repository.status = "pending"
    repository.error_message = None
    db.commit()
    db.refresh(repository)
    background_tasks.add_task(
        analyze_repository,
        repository.id,
        db,
        current_user.github_access_token,
        current_user.azure_devops_token,
        current_user.gitlab_access_token,
        current_user.bitbucket_access_token,
    )
    return repository


@router.get("/{repo_id}/knowledge-base", response_model=KnowledgeBaseResponse)
def get_knowledge_base(
    repo_id: str,
    entry_type: str | None = None,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KnowledgeBaseResponse:
    """Return the knowledge base for the current operation.

    Args:
        repo_id: Repository identifier.
        entry_type: entry_type value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    repository = get_accessible_repository(db, repo_id, current_user)

    query = select(KnowledgeBase).where(KnowledgeBase.repository_id == repo_id)
    if entry_type:
        query = query.where(KnowledgeBase.entry_type == entry_type)
    query = query.order_by(KnowledgeBase.created_at)

    entries = db.scalars(query).all()
    return KnowledgeBaseResponse(
        repository_id=repo_id,
        status=repository.knowledge_base_status,
        entries=entries,
        total=len(entries),
    )


def get_stored_repository_file(repo_id: str, file_path: str) -> Path:
    """Return the stored repository file for the current operation.

    Args:
        repo_id: Repository identifier.
        file_path: Repository-relative file path.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    storage_roots = [REPOSITORY_STORAGE_DIR.resolve()]
    legacy_root = (Path("uploads") / "repositories").resolve()
    if legacy_root not in storage_roots:
        storage_roots.append(legacy_root)

    for storage_root in storage_roots:
        root = (storage_root / repo_id).resolve()
        requested = (root / file_path).resolve()
        try:
            requested.relative_to(root)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path") from exc

        if requested.exists() and requested.is_file():
            return requested

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File is not in local repository storage. Re-analyze the repository once to restore previews.")


def format_notebook_preview(requested: Path) -> str:
    """Handle format notebook preview for the current operation.

    Args:
        requested: requested value used by the operation.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    try:
        notebook = json.loads(requested.read_text(encoding="utf-8", errors="replace"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This notebook is not valid JSON and cannot be previewed.",
        ) from exc

    if not isinstance(notebook, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This notebook does not contain a valid notebook object.",
        )

    cells = notebook.get("cells")
    if not isinstance(cells, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This notebook does not contain a valid cells list.",
        )

    sections: list[str] = []
    for index, cell in enumerate(cells, start=1):
        if not isinstance(cell, dict):
            continue
        cell_type = str(cell.get("cell_type") or "unknown")
        source = cell.get("source", "")
        source_text = "".join(str(part) for part in source) if isinstance(source, list) else str(source)

        if cell_type == "code":
            execution_count = cell.get("execution_count")
            label = f"Code cell {index}"
            if execution_count is not None:
                label += f" (execution {execution_count})"
            sections.append(f"--- {label} ---\n{source_text.rstrip()}")
        elif cell_type == "markdown":
            sections.append(f"--- Markdown cell {index} ---\n{source_text.rstrip()}")
        elif cell_type == "raw":
            sections.append(f"--- Raw cell {index} ---\n{source_text.rstrip()}")

    if not sections:
        return "[This notebook has no previewable cells.]"
    return "\n\n".join(sections)


@router.get("/{repo_id}/files", response_model=RepositoryFileResponse)
def get_repository_file(
    repo_id: str,
    file_path: str = Query(..., alias="path"),
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RepositoryFileResponse:
    """Return the repository file for the current operation.

    Args:
        repo_id: Repository identifier.
        file_path: Repository-relative file path.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    get_accessible_repository(db, repo_id, current_user)
    requested = get_stored_repository_file(repo_id, file_path)
    size = requested.stat().st_size
    suffix = requested.suffix.lower()

    if suffix == ".ipynb":
        content = (
            format_notebook_preview(requested)
            if size <= MAX_NOTEBOOK_PREVIEW_BYTES
            else (
                f"[Preview skipped: notebook is {size} bytes, above the "
                f"{MAX_NOTEBOOK_PREVIEW_BYTES} byte preview limit.]"
            )
        )
        return RepositoryFileResponse(
            repository_id=repo_id,
            path=file_path,
            entry_type="source_file",
            content=content,
            mime_type="application/x-ipynb+json",
            size=size,
        )

    if suffix in IMAGE_FILE_EXTENSIONS:
        mime_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        if size > MAX_IMAGE_FILE_BYTES:
            content = f"[Skipped: image file is {size} bytes, above the {MAX_IMAGE_FILE_BYTES} byte preview limit.]"
        else:
            content = f"data:{mime_type};base64,{b64encode(requested.read_bytes()).decode('ascii')}"
        return RepositoryFileResponse(
            repository_id=repo_id,
            path=file_path,
            entry_type="image_file",
            content=content,
            mime_type=mime_type,
            size=size,
        )

    mime_type = mimetypes.guess_type(requested.name)[0] or "text/plain"
    if size > MAX_TEXT_FILE_BYTES:
        content = f"[Preview skipped: file is {size} bytes, above the {MAX_TEXT_FILE_BYTES} byte preview limit.]"
    else:
        raw_content = requested.read_bytes()
        if b"\x00" in raw_content[:8192]:
            content = f"[Binary file: {mime_type}, {size} bytes. Text preview is not available.]"
        else:
            content = raw_content.decode("utf-8", errors="replace")

    return RepositoryFileResponse(
        repository_id=repo_id,
        path=file_path,
        entry_type="source_file",
        content=content,
        mime_type=mime_type,
        size=size,
    )


@router.get("/{repo_id}/uploads", response_model=RepositoryUploadListResponse)
def list_repository_uploads(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RepositoryUploadListResponse:
    """List repository uploads for the current user.

    Args:
        repo_id: Repository identifier.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    get_accessible_repository(db, repo_id, current_user)
    uploads = [to_repository_upload_response(upload) for upload in read_repository_upload_manifest(repo_id)]
    uploads.sort(key=lambda upload: upload.uploaded_at, reverse=True)
    return RepositoryUploadListResponse(uploads=uploads, total=len(uploads))


@router.post("/{repo_id}/uploads", response_model=RepositoryUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_repository_document(
    repo_id: str,
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RepositoryUploadResponse:
    """Handle upload repository document for the current operation.

    Args:
        repo_id: Repository identifier.
        file: Uploaded file supplied by the client.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    get_owned_repository(db, repo_id, current_user.id)
    filename = Path(file.filename or "upload").name
    size = get_upload_size(file)
    if size > MAX_DOCUMENT_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Uploaded file exceeds 100MB")

    upload_id = str(uuid4())
    upload_dir = get_repository_document_dir(repo_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    upload_path = upload_dir / upload_id
    with upload_path.open("wb") as destination:
        shutil.copyfileobj(file.file, destination)

    upload = {
        "id": upload_id,
        "filename": filename,
        "content_type": file.content_type,
        "size": size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.id,
    }
    uploads = read_repository_upload_manifest(repo_id)
    uploads.append(upload)
    write_repository_upload_manifest(repo_id, uploads)
    return to_repository_upload_response(upload)


@router.get("/{repo_id}/uploads/{upload_id}/download")
def download_repository_upload(
    repo_id: str,
    upload_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Handle download repository upload for the current operation.

    Args:
        repo_id: Repository identifier.
        upload_id: upload_id value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    get_accessible_repository(db, repo_id, current_user)
    uploads = read_repository_upload_manifest(repo_id)
    upload = next((candidate for candidate in uploads if candidate["id"] == upload_id), None)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    upload_path = get_repository_upload_file_path(repo_id, upload_id)
    if not upload_path.exists() or not upload_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Uploaded file not found")

    return FileResponse(
        upload_path,
        media_type=upload.get("content_type") or "application/octet-stream",
        filename=upload["filename"],
    )


@router.delete("/{repo_id}/uploads/{upload_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repository_upload(
    repo_id: str,
    upload_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete the requested repository upload resource.

    Args:
        repo_id: Repository identifier.
        upload_id: upload_id value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    get_owned_repository(db, repo_id, current_user.id)
    uploads = read_repository_upload_manifest(repo_id)
    upload = next((candidate for candidate in uploads if candidate["id"] == upload_id), None)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    upload_path = get_repository_upload_file_path(repo_id, upload_id)
    if upload_path.exists() and upload_path.is_file():
        upload_path.unlink()

    remaining_uploads = [candidate for candidate in uploads if candidate["id"] != upload_id]
    write_repository_upload_manifest(repo_id, remaining_uploads)


@router.post("/{repo_id}/analyze-contributors", response_model=ContributorListResponse)
def analyze_repository_contributors(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContributorListResponse:
    """Handle analyze repository contributors for the current operation.

    Args:
        repo_id: Repository identifier.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    repository = get_owned_repository(db, repo_id, current_user.id)
    if repository.source_type == "upload":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contributor analysis is only available for git-connected repositories, not uploads.",
        )

    try:
        analyze_contributors(
            repo_id,
            db,
            current_user.github_access_token,
            current_user.azure_devops_token,
            current_user.gitlab_access_token,
            current_user.bitbucket_access_token,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)[:300]) from exc

    contributors = db.scalars(
        select(Contributor)
        .where(Contributor.repository_id == repo_id)
        .order_by(
            (func.coalesce(Contributor.commit_count, 0) + func.coalesce(Contributor.prs_authored, 0)).desc()
        )
    ).all()
    return ContributorListResponse(
        repository_id=repo_id,
        contributors=contributors,
        total=len(contributors),
    )


@router.get("/{repo_id}/contributors", response_model=ContributorListResponse)
def get_contributors(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContributorListResponse:
    """Return the contributors for the current operation.

    Args:
        repo_id: Repository identifier.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    repository = get_owned_repository(db, repo_id, current_user.id)

    contributors = db.scalars(
        select(Contributor)
        .where(Contributor.repository_id == repo_id)
        .order_by(
            (func.coalesce(Contributor.commit_count, 0) + func.coalesce(Contributor.prs_authored, 0)).desc()
        )
    ).all()
    return ContributorListResponse(
        repository_id=repo_id,
        contributors=contributors,
        total=len(contributors),
    )


@router.post("/{repo_id}/assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(
    repo_id: str,
    payload: AssignLearnerRequest,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentResponse:
    """Create assignment records for the request.

    Args:
        repo_id: Repository identifier.
        payload: Validated request body for the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    repository = get_owned_repository(db, repo_id, current_user.id)

    requested_topic_id = (payload.kt_topic_id or "").strip() or None
    topic = None
    if requested_topic_id:
        topic = db.get(KTTopic, requested_topic_id)
        if topic is None or topic.repository_id != repo_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    # The database requires an assignment topic. Use the hidden repository-level
    # topic when the admin intentionally leaves the optional topic selector empty.
    assignment_topic = topic or get_or_create_repository_learning_topic(db, repository, current_user)
    kt_topic_id = assignment_topic.id

    learner = db.get(User, payload.learner_id)
    if learner is None or not is_learner(learner):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learner not found")

    existing_filter = [
        RepositoryAssignment.repository_id == repo_id,
        RepositoryAssignment.learner_id == payload.learner_id,
    ]
    if requested_topic_id:
        existing_filter.append(RepositoryAssignment.kt_topic_id == requested_topic_id)

    existing = db.scalar(select(RepositoryAssignment).where(*existing_filter))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Learner already assigned to this KT topic"
                if requested_topic_id
                else "Learner already assigned to this repository"
            ),
        )

    assignment = RepositoryAssignment(
        repository_id=repo_id,
        kt_topic_id=kt_topic_id,
        learner_id=payload.learner_id,
        assigned_by=current_user.id,
        status="assigned",
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return AssignmentResponse(
        id=assignment.id,
        repository_id=assignment.repository_id,
        kt_topic_id=assignment.kt_topic_id,
        kt_topic_title=topic.title if topic else None,
        learner_id=assignment.learner_id,
        learner_name=learner.name,
        learner_email=learner.email,
        status=assignment.status,
        assigned_at=assignment.assigned_at,
    )


@router.post("/{repo_id}/assign-kt-provider", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
def assign_kt_provider(
    repo_id: str,
    payload: AssignKtProviderRequest,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentResponse:
    """Assign a registered contributor to deliver a repository KT topic."""
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    repository = get_owned_repository(db, repo_id, current_user.id)
    topic = db.get(KTTopic, payload.kt_topic_id)
    if topic is None or topic.repository_id != repo_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    email = payload.contributor_email.strip().lower()
    provider = db.scalar(select(User).where(func.lower(User.email) == email))
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No SynapseIQ account found for '{payload.contributor_email}'. "
                "Create a learner account for this developer first."
            ),
        )
    if not is_learner(provider):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The matching SynapseIQ account must have the learner role.",
        )

    existing_topic_assignment = db.scalar(
        select(RepositoryAssignment).where(
            RepositoryAssignment.kt_topic_id == topic.id,
            RepositoryAssignment.learner_id == provider.id,
        )
    )
    if existing_topic_assignment is not None:
        detail = (
            "This user is already assigned as KT provider for this topic."
            if existing_topic_assignment.status == "kt_provider_assigned"
            else "This user already has a learner assignment for this topic."
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    provider_assignment = RepositoryAssignment(
        repository_id=repo_id,
        kt_topic_id=topic.id,
        learner_id=provider.id,
        assigned_by=current_user.id,
        status="kt_provider_assigned",
    )
    db.add(provider_assignment)

    access_topic = get_or_create_repository_learning_topic(db, repository, current_user)
    existing_access = db.scalar(
        select(RepositoryAssignment).where(
            RepositoryAssignment.kt_topic_id == access_topic.id,
            RepositoryAssignment.learner_id == provider.id,
        )
    )
    if existing_access is None:
        db.add(RepositoryAssignment(
            repository_id=repo_id,
            kt_topic_id=access_topic.id,
            learner_id=provider.id,
            assigned_by=current_user.id,
            status="assigned",
        ))

    db.commit()
    db.refresh(provider_assignment)
    return AssignmentResponse(
        id=provider_assignment.id,
        repository_id=provider_assignment.repository_id,
        kt_topic_id=provider_assignment.kt_topic_id,
        kt_topic_title=topic.title,
        learner_id=provider.id,
        learner_name=provider.name,
        learner_email=provider.email,
        status=provider_assignment.status,
        assigned_at=provider_assignment.assigned_at,
    )


@router.get("/{repo_id}/assignments", response_model=AssignmentListResponse)
def list_assignments(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentListResponse:
    """List assignments for the current user.

    Args:
        repo_id: Repository identifier.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    rows = db.scalars(select(RepositoryAssignment).where(RepositoryAssignment.repository_id == repo_id)).all()
    results = []
    for a in rows:
        topic = db.get(KTTopic, a.kt_topic_id)
        is_repository_learning = topic and topic.path_patterns == REPOSITORY_LEARNING_TOPIC_MARKER
        learner = db.get(User, a.learner_id)
        checklist_item_ids = list(
            db.scalars(
                select(KTChecklistItem.id).where(KTChecklistItem.kt_topic_id == a.kt_topic_id)
            ).all()
        )
        completed_items = 0
        if checklist_item_ids:
            completed_items = db.scalar(
                select(func.count())
                .select_from(KTChecklistProgress)
                .where(
                    KTChecklistProgress.checklist_item_id.in_(checklist_item_ids),
                    KTChecklistProgress.learner_id == a.learner_id,
                )
            ) or 0
        results.append(AssignmentResponse(
            id=a.id,
            repository_id=a.repository_id,
            kt_topic_id=a.kt_topic_id,
            kt_topic_title=None if is_repository_learning else topic.title if topic else None,
            learner_id=a.learner_id,
            learner_name=learner.name if learner else "Unknown",
            learner_email=learner.email if learner else "",
            status=a.status,
            assigned_at=a.assigned_at,
            completed_items=completed_items,
            total_items=len(checklist_item_ids),
        ))
    return AssignmentListResponse(assignments=results, total=len(results))


@router.delete("/{repo_id}/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    repo_id: str,
    assignment_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete the requested assignment resource.

    Args:
        repo_id: Repository identifier.
        assignment_id: assignment_id value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    assignment = db.get(RepositoryAssignment, assignment_id)
    if assignment is None or assignment.repository_id != repo_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    db.delete(assignment)
    db.commit()


@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repository(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete the requested repository resource.

    Args:
        repo_id: Repository identifier.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.
    """
    repository = get_owned_repository(db, repo_id, current_user.id)

    upload_path = UPLOAD_DIR / f"{repo_id}.zip"
    if upload_path.exists():
        upload_path.unlink()

    repository_path = REPOSITORY_STORAGE_DIR / repo_id
    if repository_path.exists():
        shutil.rmtree(repository_path)

    document_path = get_repository_document_dir(repo_id)
    if document_path.exists():
        shutil.rmtree(document_path)

    topic_ids = select(KTTopic.id).where(KTTopic.repository_id == repo_id)
    checklist_item_ids = select(KTChecklistItem.id).where(KTChecklistItem.kt_topic_id.in_(topic_ids))

    db.execute(sql_delete(ChatMessage).where(ChatMessage.repository_id == repo_id))
    db.execute(sql_delete(KnowledgeBase).where(KnowledgeBase.repository_id == repo_id))
    db.execute(sql_delete(KTChecklistProgress).where(KTChecklistProgress.checklist_item_id.in_(checklist_item_ids)))
    db.execute(sql_delete(KTChecklistItem).where(KTChecklistItem.kt_topic_id.in_(topic_ids)))
    db.execute(sql_delete(RepositoryAssignment).where(RepositoryAssignment.repository_id == repo_id))
    db.execute(sql_delete(KTTopic).where(KTTopic.repository_id == repo_id))
    db.execute(sql_delete(Contributor).where(Contributor.repository_id == repo_id))

    db.delete(repository)
    db.commit()


@router.get("/{repo_id}", response_model=RepositoryResponse)
def get_repository(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Repository:
    """Return the repository for the current operation.

    Args:
        repo_id: Repository identifier.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    return get_accessible_repository(db, repo_id, current_user)
