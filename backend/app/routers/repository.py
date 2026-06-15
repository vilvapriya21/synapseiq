from pathlib import Path
import shutil

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.knowledge_base import KnowledgeBase
from app.models.repository import Repository
from app.models.user import User
from app.modules.git_provider import detect_provider, extract_repo_name, is_valid_git_url
from app.modules.repository_analysis import analyze_repository
from app.schemas.repository import (
    KnowledgeBaseResponse,
    RepositoryConnectRequest,
    RepositoryListResponse,
    RepositoryResponse,
)

router = APIRouter()

MAX_UPLOAD_SIZE_BYTES = 2_000_000_000
UPLOAD_DIR = Path("uploaded_repos")


def get_repository_name_from_filename(filename: str) -> str:
    name = Path(filename).name
    if name.lower().endswith(".zip"):
        return name[:-4]
    return name


def get_upload_size(file: UploadFile) -> int:
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    return size


def get_owned_repository(db: DbSession, repo_id: str, owner_id: str) -> Repository:
    repository = db.scalar(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.owner_id == owner_id,
        )
    )
    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return repository


@router.post("/connect", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
def connect_repository(
    payload: RepositoryConnectRequest,
    background_tasks: BackgroundTasks,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Repository:
    if not is_valid_git_url(payload.url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid git repository URL starting with https://",
        )
    provider = detect_provider(payload.url)

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
    background_tasks.add_task(analyze_repository, repository.id, db, current_user.github_access_token)
    return repository


@router.post("/upload", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
def upload_repository(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Repository:
    filename = file.filename or ""
    if file.content_type != "application/zip" and not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only ZIP uploads are supported")

    if get_upload_size(file) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Uploaded file exceeds 2GB")

    repository = Repository(
        name=get_repository_name_from_filename(filename),
        source_type="upload",
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
    repositories = db.scalars(
        select(Repository)
        .where(Repository.owner_id == current_user.id)
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
    repository = get_owned_repository(db, repo_id, current_user.id)

    repository.status = "pending"
    repository.error_message = None
    db.commit()
    db.refresh(repository)
    background_tasks.add_task(analyze_repository, repository.id, db, current_user.github_access_token)
    return repository


@router.get("/{repo_id}/knowledge-base", response_model=KnowledgeBaseResponse)
def get_knowledge_base(
    repo_id: str,
    entry_type: str | None = None,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KnowledgeBaseResponse:
    repository = get_owned_repository(db, repo_id, current_user.id)

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


@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repository(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    repository = get_owned_repository(db, repo_id, current_user.id)

    upload_path = UPLOAD_DIR / f"{repo_id}.zip"
    if upload_path.exists():
        upload_path.unlink()

    from sqlalchemy import delete as sql_delete
    from app.models.knowledge_base import KnowledgeBase

    db.execute(sql_delete(KnowledgeBase).where(KnowledgeBase.repository_id == repo_id))

    db.delete(repository)
    db.commit()


@router.get("/{repo_id}", response_model=RepositoryResponse)
def get_repository(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Repository:
    return get_owned_repository(db, repo_id, current_user.id)
