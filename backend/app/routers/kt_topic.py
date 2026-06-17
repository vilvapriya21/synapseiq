from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sql_delete, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.contributor import Contributor
from app.models.kt_topic import KTTopic
from app.models.repository_assignment import RepositoryAssignment
from app.models.user import User
from app.routers.repository import get_owned_repository
from app.schemas.kt_topic import (
    CreateKTTopicRequest,
    KTTopicListResponse,
    KTTopicResponse,
    RecommendedContributor,
    TopicRecommendationResponse,
)

router = APIRouter()


def is_admin(user: User) -> bool:
    return user.role.lower() == "admin"


@router.post("", response_model=KTTopicResponse, status_code=status.HTTP_201_CREATED)
def create_kt_topic(
    repo_id: str,
    payload: CreateKTTopicRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KTTopic:
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    get_owned_repository(db, repo_id, current_user.id)

    topic = KTTopic(
        repository_id=repo_id,
        title=payload.title,
        description=payload.description,
        path_patterns=payload.path_patterns,
        created_by=current_user.id,
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


@router.get("", response_model=KTTopicListResponse)
def list_kt_topics(
    repo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KTTopicListResponse:
    topics = db.scalars(
        select(KTTopic).where(KTTopic.repository_id == repo_id).order_by(KTTopic.created_at)
    ).all()
    return KTTopicListResponse(topics=topics, total=len(topics))


def parse_top_files(top_files_str: str | None) -> dict[str, int]:
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
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    topic = db.get(KTTopic, topic_id)
    if topic is None or topic.repository_id != repo_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    if not topic.path_patterns:
        return TopicRecommendationResponse(kt_topic_id=topic_id, kt_topic_title=topic.title, recommendations=[])

    patterns = [p.strip() for p in topic.path_patterns.split(",") if p.strip()]
    contributors = db.scalars(select(Contributor).where(Contributor.repository_id == repo_id)).all()

    scored = []
    for c in contributors:
        files = parse_top_files(c.top_files)
        match_count = sum(1 for path in files if any(path.startswith(p) for p in patterns))
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


@router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_kt_topic(
    repo_id: str,
    topic_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    topic = db.get(KTTopic, topic_id)
    if topic is None or topic.repository_id != repo_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    db.execute(sql_delete(RepositoryAssignment).where(RepositoryAssignment.kt_topic_id == topic_id))
    db.delete(topic)
    db.commit()
