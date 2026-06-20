"""API endpoints for KT topics, checklist items, and learner progress."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import delete as sql_delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.llm_dependency import get_llm
from app.core.security import get_current_user
from app.db.session import SessionLocal, get_db
from app.models.assessment import Assessment
from app.models.contributor import Contributor
from app.models.kt_checklist import KTChecklistItem, KTChecklistProgress
from app.models.kt_topic import KTTopic
from app.models.repository_assignment import RepositoryAssignment
from app.models.user import User
from app.modules.checklist_generator import fallback_checklist_items, generate_checklist_items
from app.modules.llm_client import LLMProvider
from app.routers.repository import REPOSITORY_LEARNING_TOPIC_MARKER, get_owned_repository
from app.schemas.kt_topic import (
    ChecklistItemCreate,
    ChecklistItemResponse,
    ChecklistItemUpdate,
    ChecklistListResponse,
    CreateKTTopicRequest,
    KTTopicListResponse,
    KTTopicResponse,
    RecommendedContributor,
    TopicRecommendationResponse,
)
from app.utils.path_matching import count_matching_paths, normalize_path_patterns, parse_path_patterns

router = APIRouter()
logger = logging.getLogger(__name__)


def _generate_topic_checklist(
    topic_id: str,
    created_by: str,
    llm: LLMProvider,
    replace_existing: bool = False,
) -> None:
    """Generate a new topic's checklist without delaying the create response."""
    db = SessionLocal()
    try:
        topic = db.get(KTTopic, topic_id)
        if topic is None:
            return

        existing_item = db.scalar(select(KTChecklistItem.id).where(KTChecklistItem.kt_topic_id == topic_id))
        if existing_item is not None and not replace_existing:
            return

        checklist_items = generate_checklist_items(topic, db, llm)
        if replace_existing:
            existing_items = list(
                db.scalars(
                    select(KTChecklistItem)
                    .where(KTChecklistItem.kt_topic_id == topic_id)
                    .order_by(KTChecklistItem.order)
                ).all()
            )
            for index, item in enumerate(checklist_items):
                if index < len(existing_items):
                    existing_items[index].title = item["title"]
                    existing_items[index].description = item.get("description")
                    existing_items[index].order = index
                else:
                    db.add(
                        KTChecklistItem(
                            kt_topic_id=topic.id,
                            title=item["title"],
                            description=item.get("description"),
                            order=index,
                            created_by=created_by,
                        )
                    )
            db.commit()
            return

        for index, item in enumerate(checklist_items):
            db.add(
                KTChecklistItem(
                    kt_topic_id=topic.id,
                    title=item["title"],
                    description=item.get("description"),
                    order=index,
                    created_by=created_by,
                )
            )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Background checklist generation failed for kt_topic_id=%s", topic_id)
    finally:
        db.close()


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


def get_accessible_topic(
    db: Session,
    repo_id: str,
    topic_id: str,
    current_user: User,
) -> KTTopic:
    """Return the accessible topic for the current operation.

    Args:
        db: Database session used for persistence and queries.
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    topic = db.get(KTTopic, topic_id)
    if topic is None or topic.repository_id != repo_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    if is_admin(current_user):
        get_owned_repository(db, repo_id, current_user.id)
        return topic

    if is_learner(current_user):
        assignment = db.scalar(
            select(RepositoryAssignment).where(
                RepositoryAssignment.repository_id == repo_id,
                RepositoryAssignment.kt_topic_id == topic_id,
                RepositoryAssignment.learner_id == current_user.id,
            )
        )
        if assignment is not None:
            return topic

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")


def require_admin_owner(
    db: Session,
    repo_id: str,
    topic_id: str,
    current_user: User,
) -> KTTopic:
    """Handle require admin owner for the current operation.

    Args:
        db: Database session used for persistence and queries.
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    topic = get_accessible_topic(db, repo_id, topic_id, current_user)
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return topic


def get_topic_checklist_item(db: Session, topic_id: str, item_id: str) -> KTChecklistItem:
    """Return the topic checklist item for the current operation.

    Args:
        db: Database session used for persistence and queries.
        topic_id: topic_id value used by the operation.
        item_id: item_id value used by the operation.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    item = db.get(KTChecklistItem, item_id)
    if item is None or item.kt_topic_id != topic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")
    return item


def checklist_item_response(
    item: KTChecklistItem,
    completed: bool = False,
    completed_at: datetime | None = None,
) -> ChecklistItemResponse:
    """Handle checklist item response for the current operation.

    Args:
        item: item value used by the operation.
        completed: completed value used by the operation.
        completed_at: completed_at value used by the operation.

    Returns:
        Result produced by the operation.
    """
    return ChecklistItemResponse(
        id=item.id,
        kt_topic_id=item.kt_topic_id,
        title=item.title,
        description=item.description,
        order=item.order,
        created_at=item.created_at,
        completed=completed,
        completed_at=completed_at,
    )


@router.post("", response_model=KTTopicResponse, status_code=status.HTTP_201_CREATED)
def create_kt_topic(
    repo_id: str,
    payload: CreateKTTopicRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm: LLMProvider = Depends(get_llm),
) -> KTTopic:
    """Create kt topic records for the request.

    Args:
        repo_id: Repository identifier.
        payload: Validated request body for the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.
        llm: LLM provider used for generation.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    get_owned_repository(db, repo_id, current_user.id)

    topic = KTTopic(
        repository_id=repo_id,
        title=payload.title,
        description=payload.description,
        path_patterns=normalize_path_patterns(payload.path_patterns),
        created_by=current_user.id,
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)

    background_tasks.add_task(_generate_topic_checklist, topic.id, current_user.id, llm)

    return topic


@router.get("", response_model=KTTopicListResponse)
def list_kt_topics(
    repo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KTTopicListResponse:
    """List kt topics for the current user.

    Args:
        repo_id: Repository identifier.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    topics = db.scalars(
        select(KTTopic)
        .where(
            KTTopic.repository_id == repo_id,
            or_(
                KTTopic.path_patterns.is_(None),
                KTTopic.path_patterns != REPOSITORY_LEARNING_TOPIC_MARKER,
            ),
        )
        .order_by(KTTopic.created_at)
    ).all()
    return KTTopicListResponse(topics=topics, total=len(topics))


def parse_top_files(top_files_str: str | None) -> dict[str, int]:
    """Parse top files into structured data.

    Args:
        top_files_str: top_files_str value used by the operation.

    Returns:
        Result produced by the operation.
    """
    if not top_files_str:
        return {}
    result: dict[str, int] = {}
    for pair in top_files_str.split(","):
        if ":" in pair:
            path, count = pair.rsplit(":", 1)
            try:
                result[path] = int(count)
            except ValueError:
                continue
    return result


@router.get("/{topic_id}/recommend", response_model=TopicRecommendationResponse)
def recommend_contributor(
    repo_id: str,
    topic_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TopicRecommendationResponse:
    """Handle recommend contributor for the current operation.

    Args:
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    topic = db.get(KTTopic, topic_id)
    if topic is None or topic.repository_id != repo_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    if not topic.path_patterns:
        return TopicRecommendationResponse(kt_topic_id=topic_id, kt_topic_title=topic.title, recommendations=[])

    patterns = parse_path_patterns(topic.path_patterns)
    contributors = db.scalars(select(Contributor).where(Contributor.repository_id == repo_id)).all()

    scored = []
    for c in contributors:
        files = parse_top_files(c.top_files)
        match_count = count_matching_paths(list(files), patterns)
        if match_count > 0:
            scored.append(RecommendedContributor(
                name=c.name,
                email=c.email,
                commit_count=c.commit_count,
                relevant_file_matches=match_count,
            ))

    scored.sort(key=lambda r: (r.relevant_file_matches, r.commit_count), reverse=True)
    return TopicRecommendationResponse(
        kt_topic_id=topic_id,
        kt_topic_title=topic.title,
        recommendations=scored[:5],
    )


@router.get("/{topic_id}/checklist", response_model=ChecklistListResponse)
def list_checklist_items(
    repo_id: str,
    topic_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChecklistListResponse:
    """List checklist items for the current user.

    Args:
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    get_accessible_topic(db, repo_id, topic_id, current_user)

    items = db.scalars(
        select(KTChecklistItem)
        .where(KTChecklistItem.kt_topic_id == topic_id)
        .order_by(KTChecklistItem.order, KTChecklistItem.created_at)
    ).all()

    progress_by_item_id: dict[str, KTChecklistProgress] = {}
    if is_learner(current_user):
        progress_rows = db.scalars(
            select(KTChecklistProgress).where(
                KTChecklistProgress.learner_id == current_user.id,
                KTChecklistProgress.checklist_item_id.in_([item.id for item in items]),
            )
        ).all()
        progress_by_item_id = {progress.checklist_item_id: progress for progress in progress_rows}

    responses = []
    for item in items:
        progress = progress_by_item_id.get(item.id)
        responses.append(
            checklist_item_response(
                item,
                completed=progress is not None and progress.completed_at is not None,
                completed_at=progress.completed_at if progress else None,
            )
        )

    return ChecklistListResponse(items=responses, total=len(responses))


@router.post(
    "/{topic_id}/checklist",
    response_model=ChecklistItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_checklist_item(
    repo_id: str,
    topic_id: str,
    payload: ChecklistItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChecklistItemResponse:
    """Create checklist item records for the request.

    Args:
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        payload: Validated request body for the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    topic = require_admin_owner(db, repo_id, topic_id, current_user)
    max_order = db.scalar(
        select(func.max(KTChecklistItem.order)).where(KTChecklistItem.kt_topic_id == topic.id)
    )
    item = KTChecklistItem(
        kt_topic_id=topic.id,
        title=payload.title,
        description=payload.description,
        order=(max_order if max_order is not None else -1) + 1,
        created_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return checklist_item_response(item)


@router.patch("/{topic_id}/checklist/{item_id}", response_model=ChecklistItemResponse)
def update_checklist_item(
    repo_id: str,
    topic_id: str,
    item_id: str,
    payload: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChecklistItemResponse:
    """Update the requested checklist item resource.

    Args:
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        item_id: item_id value used by the operation.
        payload: Validated request body for the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    topic = require_admin_owner(db, repo_id, topic_id, current_user)
    item = get_topic_checklist_item(db, topic.id, item_id)

    if payload.title is not None:
        item.title = payload.title
    if payload.description is not None:
        item.description = payload.description
    if payload.order is not None:
        item.order = payload.order

    db.commit()
    db.refresh(item)
    return checklist_item_response(item)


@router.delete("/{topic_id}/checklist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist_item(
    repo_id: str,
    topic_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete the requested checklist item resource.

    Args:
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        item_id: item_id value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.
    """
    topic = require_admin_owner(db, repo_id, topic_id, current_user)
    item = get_topic_checklist_item(db, topic.id, item_id)
    db.execute(sql_delete(KTChecklistProgress).where(KTChecklistProgress.checklist_item_id == item.id))
    db.delete(item)
    db.commit()


@router.post("/{topic_id}/checklist/regenerate", response_model=ChecklistListResponse)
def regenerate_checklist(
    repo_id: str,
    topic_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm: LLMProvider = Depends(get_llm),
) -> ChecklistListResponse:
    """Handle regenerate checklist for the current operation.

    Args:
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.
        llm: LLM provider used for generation.

    Returns:
        Result produced by the operation.
    """
    topic = require_admin_owner(db, repo_id, topic_id, current_user)
    checklist_item_ids = db.scalars(
        select(KTChecklistItem.id).where(KTChecklistItem.kt_topic_id == topic.id)
    ).all()
    if checklist_item_ids:
        db.execute(
            sql_delete(KTChecklistProgress).where(
                KTChecklistProgress.checklist_item_id.in_(checklist_item_ids)
            )
        )
    db.execute(sql_delete(KTChecklistItem).where(KTChecklistItem.kt_topic_id == topic.id))

    generated_items = fallback_checklist_items(topic)
    created_items = []
    for index, generated_item in enumerate(generated_items):
        item = KTChecklistItem(
            kt_topic_id=topic.id,
            title=generated_item["title"],
            description=generated_item.get("description"),
            order=index,
            created_by=current_user.id,
        )
        db.add(item)
        created_items.append(item)

    db.commit()
    for item in created_items:
        db.refresh(item)

    background_tasks.add_task(
        _generate_topic_checklist,
        topic.id,
        current_user.id,
        llm,
        True,
    )

    responses = [checklist_item_response(item) for item in created_items]
    return ChecklistListResponse(items=responses, total=len(responses))


@router.post("/{topic_id}/checklist/{item_id}/complete", response_model=ChecklistItemResponse)
def complete_checklist_item(
    repo_id: str,
    topic_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChecklistItemResponse:
    """Handle complete checklist item for the current operation.

    Args:
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        item_id: item_id value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    topic = get_accessible_topic(db, repo_id, topic_id, current_user)
    if not is_learner(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Learner access required")

    item = get_topic_checklist_item(db, topic.id, item_id)
    completed_at = datetime.now(timezone.utc)
    progress = db.scalar(
        select(KTChecklistProgress).where(
            KTChecklistProgress.checklist_item_id == item.id,
            KTChecklistProgress.learner_id == current_user.id,
        )
    )
    if progress is None:
        progress = KTChecklistProgress(
            checklist_item_id=item.id,
            learner_id=current_user.id,
            completed_at=completed_at,
        )
        db.add(progress)
    else:
        progress.completed_at = completed_at

    db.commit()
    db.refresh(progress)
    return checklist_item_response(item, completed=True, completed_at=progress.completed_at)


@router.delete("/{topic_id}/checklist/{item_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
def uncomplete_checklist_item(
    repo_id: str,
    topic_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Handle uncomplete checklist item for the current operation.

    Args:
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        item_id: item_id value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    topic = get_accessible_topic(db, repo_id, topic_id, current_user)
    if not is_learner(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Learner access required")

    item = get_topic_checklist_item(db, topic.id, item_id)
    db.execute(
        sql_delete(KTChecklistProgress).where(
            KTChecklistProgress.checklist_item_id == item.id,
            KTChecklistProgress.learner_id == current_user.id,
        )
    )
    db.commit()


@router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_kt_topic(
    repo_id: str,
    topic_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete the requested kt topic resource.

    Args:
        repo_id: Repository identifier.
        topic_id: topic_id value used by the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    topic = db.get(KTTopic, topic_id)
    if topic is None or topic.repository_id != repo_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    active_assignments = db.scalars(
        select(RepositoryAssignment).where(RepositoryAssignment.kt_topic_id == topic_id)
    ).all()
    if active_assignments:
        learner_count = len(active_assignments)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot remove this KT topic — {learner_count} learner(s) are currently assigned to it. Remove all learner assignments first.",
        )

    has_assessment = db.scalar(select(Assessment).where(Assessment.kt_topic_id == topic_id))
    if has_assessment:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot remove this KT topic — an active assessment is linked to it. Delete the assessment first.",
        )

    checklist_item_ids = db.scalars(
        select(KTChecklistItem.id).where(KTChecklistItem.kt_topic_id == topic_id)
    ).all()
    if checklist_item_ids:
        db.execute(
            sql_delete(KTChecklistProgress).where(
                KTChecklistProgress.checklist_item_id.in_(checklist_item_ids)
            )
        )
    db.execute(sql_delete(KTChecklistItem).where(KTChecklistItem.kt_topic_id == topic_id))
    db.execute(sql_delete(RepositoryAssignment).where(RepositoryAssignment.kt_topic_id == topic_id))
    db.delete(topic)
    db.commit()
