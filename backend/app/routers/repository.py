from pathlib import Path
import shutil

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.contributor import Contributor
from app.models.knowledge_base import KnowledgeBase
from app.models.kt_topic import KTTopic
from app.models.repository import Repository
from app.models.repository_assignment import RepositoryAssignment
from app.models.user import User
from app.modules.contributor_analysis import analyze_contributors
from app.modules.git_provider import detect_provider, extract_repo_name, is_valid_git_url
from app.modules.repository_analysis import analyze_repository
from app.schemas.repository import (
    AssignmentListResponse,
    AssignmentResponse,
    AssignLearnerRequest,
    ContributorListResponse,
    KnowledgeBaseResponse,
    MyAssignmentResponse,
    RepositoryConnectRequest,
    RepositoryListResponse,
    RepositoryResponse,
)

router = APIRouter()

MAX_UPLOAD_SIZE_BYTES = 2_000_000_000
UPLOAD_DIR = Path("uploaded_repos")


def is_admin(user: User) -> bool:
    return user.role.lower() == "admin"


def is_learner(user: User) -> bool:
    return user.role.lower() in {"learner", "user"}


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


def get_accessible_repository(db: DbSession, repo_id: str, current_user: User) -> Repository:
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


@router.get("/assigned-to-me", response_model=list[MyAssignmentResponse])
def get_my_assignments(
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MyAssignmentResponse]:
    rows = db.scalars(select(RepositoryAssignment).where(RepositoryAssignment.learner_id == current_user.id)).all()
    results = []
    for a in rows:
        repo = db.get(Repository, a.repository_id)
        topic = db.get(KTTopic, a.kt_topic_id)
        results.append(MyAssignmentResponse(
            assignment_id=a.id,
            repository_id=a.repository_id,
            repository_name=repo.name if repo else "Unknown",
            kt_topic_id=a.kt_topic_id,
            kt_topic_title=topic.title if topic else "Unknown",
            kt_topic_description=topic.description if topic else None,
            status=a.status,
            assigned_at=a.assigned_at,
        ))
    return results


@router.get("/assigned", response_model=RepositoryListResponse)
def get_assigned_repositories(
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RepositoryListResponse:
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
    repository = get_owned_repository(db, repo_id, current_user.id)

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


@router.post("/{repo_id}/analyze-contributors", response_model=ContributorListResponse)
def analyze_repository_contributors(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContributorListResponse:
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
        .order_by(Contributor.commit_count.desc())
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
    repository = get_owned_repository(db, repo_id, current_user.id)

    contributors = db.scalars(
        select(Contributor)
        .where(Contributor.repository_id == repo_id)
        .order_by(Contributor.commit_count.desc())
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
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    get_owned_repository(db, repo_id, current_user.id)

    topic = db.get(KTTopic, payload.kt_topic_id)
    if topic is None or topic.repository_id != repo_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    learner = db.get(User, payload.learner_id)
    if learner is None or not is_learner(learner):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learner not found")

    existing = db.scalar(
        select(RepositoryAssignment).where(
            RepositoryAssignment.kt_topic_id == payload.kt_topic_id,
            RepositoryAssignment.learner_id == payload.learner_id,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Learner already assigned to this topic")

    assignment = RepositoryAssignment(
        repository_id=repo_id,
        kt_topic_id=payload.kt_topic_id,
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
        kt_topic_title=topic.title,
        learner_id=assignment.learner_id,
        learner_name=learner.name,
        learner_email=learner.email,
        status=assignment.status,
        assigned_at=assignment.assigned_at,
    )


@router.get("/{repo_id}/assignments", response_model=AssignmentListResponse)
def list_assignments(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentListResponse:
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    rows = db.scalars(select(RepositoryAssignment).where(RepositoryAssignment.repository_id == repo_id)).all()
    results = []
    for a in rows:
        topic = db.get(KTTopic, a.kt_topic_id)
        learner = db.get(User, a.learner_id)
        results.append(AssignmentResponse(
            id=a.id,
            repository_id=a.repository_id,
            kt_topic_id=a.kt_topic_id,
            kt_topic_title=topic.title if topic else "Unknown",
            learner_id=a.learner_id,
            learner_name=learner.name if learner else "Unknown",
            learner_email=learner.email if learner else "",
            status=a.status,
            assigned_at=a.assigned_at,
        ))
    return AssignmentListResponse(assignments=results, total=len(results))


@router.delete("/{repo_id}/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    repo_id: str,
    assignment_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
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
    repository = get_owned_repository(db, repo_id, current_user.id)

    upload_path = UPLOAD_DIR / f"{repo_id}.zip"
    if upload_path.exists():
        upload_path.unlink()

    from sqlalchemy import delete as sql_delete
    from app.models.knowledge_base import KnowledgeBase

    db.execute(sql_delete(Contributor).where(Contributor.repository_id == repo_id))
    db.execute(sql_delete(KnowledgeBase).where(KnowledgeBase.repository_id == repo_id))

    db.delete(repository)
    db.commit()


@router.get("/{repo_id}", response_model=RepositoryResponse)
def get_repository(
    repo_id: str,
    db: DbSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Repository:
    return get_accessible_repository(db, repo_id, current_user)
