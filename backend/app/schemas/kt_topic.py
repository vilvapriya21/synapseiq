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
