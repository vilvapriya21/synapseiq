from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CreateKTTopicRequest(BaseModel):
    title: str
    description: Optional[str] = None
    path_patterns: Optional[str] = None


class KTTopicResponse(BaseModel):
    id: str
    repository_id: str
    title: str
    description: Optional[str]
    path_patterns: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KTTopicListResponse(BaseModel):
    topics: list[KTTopicResponse]
    total: int


class RecommendedContributor(BaseModel):
    name: str
    email: str
    commit_count: int
    relevant_file_matches: int


class TopicRecommendationResponse(BaseModel):
    kt_topic_id: str
    kt_topic_title: str
    recommendations: list[RecommendedContributor]


class ChecklistItemResponse(BaseModel):
    id: str
    kt_topic_id: str
    title: str
    description: str | None
    order: int
    created_at: datetime
    completed: bool = False
    completed_at: datetime | None = None


class ChecklistItemCreate(BaseModel):
    title: str
    description: str | None


class ChecklistItemUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    order: int | None = None


class ChecklistListResponse(BaseModel):
    items: list[ChecklistItemResponse]
    total: int
