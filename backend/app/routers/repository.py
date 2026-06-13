from pathlib import Path
import shutil

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.repository import Repository
from app.models.user import User
from app.modules.repository_analysis import analyze_repository
from app.schemas.repository import RepositoryConnectRequest, RepositoryListResponse, RepositoryResponse

router = APIRouter()

MAX_UPLOAD_SIZE_BYTES = 2_000_000_000
UPLOAD_DIR = Path("uploaded_repos")


def get_repository_name_from_url(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


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
    if not payload.url.startswith("https://github.com/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only GitHub repository URLs are supported")

    existing_repository = db.scalar(
        select(Repository).where(
            Repository.owner_id == current_user.id,
            Repository.url == payload.url,
        )
    )
    if existing_repository is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repository already exists for this user")

    repository = Repository(
        name=get_repository_name_from_url(payload.url),
        source_type="github",
        url=payload.url,
        branch=payload.branch,
        status="pending",
        owner_id=current_user.id,
    )
    db.add(repository)
    db.commit()
    db.refresh(repository)
    background_tasks.add_task(analyze_repository, repository.id, db)
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
    background_tasks.add_task(analyze_repository, repository.id, db)
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
    background_tasks.add_task(analyze_repository, repository.id, db)
    return repository


@router.get("/{repo_id}", response_model=RepositoryResponse)
def get_repository(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Repository:
    return get_owned_repository(db, repo_id, current_user.id)
