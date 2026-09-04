"""Pydantic schemas for KT topics, recommendations, and checklist items."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CreateKTTopicRequest(BaseModel):
    """Pydantic schema for CreateKTTopicRequest payloads."""
    title: str
    description: Optional[str] = None
    path_patterns: Optional[str] = None


class KTTopicResponse(BaseModel):
    """Pydantic schema for KTTopicResponse payloads."""
    id: str
    repository_id: str
    title: str
    description: Optional[str]
    path_patterns: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KTTopicListResponse(BaseModel):
    """Pydantic schema for KTTopicListResponse payloads."""
    topics: list[KTTopicResponse]
    total: int


class RecommendedContributor(BaseModel):
    """Pydantic schema for RecommendedContributor payloads."""
    name: str
    email: str
    commit_count: int
    relevant_file_matches: int


class TopicRecommendationResponse(BaseModel):
    """Pydantic schema for TopicRecommendationResponse payloads."""
    kt_topic_id: str
    kt_topic_title: str
    recommendations: list[RecommendedContributor]


class ChecklistItemResponse(BaseModel):
    """Pydantic schema for ChecklistItemResponse payloads."""
    id: str
    kt_topic_id: str
    title: str
    description: str | None
    order: int
    created_at: datetime
    completed: bool = False
    completed_at: datetime | None = None


class ChecklistItemCreate(BaseModel):
    """Pydantic schema for ChecklistItemCreate payloads."""
    title: str
    description: str | None


class ChecklistItemUpdate(BaseModel):
    """Pydantic schema for ChecklistItemUpdate payloads."""
    title: str | None = None
    description: str | None = None
    order: int | None = None


class ChecklistListResponse(BaseModel):
    """Pydantic schema for ChecklistListResponse payloads."""
    items: list[ChecklistItemResponse]
    total: int
