from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class RepositoryConnectRequest(BaseModel):
    url: str
    branch: str = "main"
    provider: Optional[str] = None
    source_type: Optional[str] = None


class RepositoryResponse(BaseModel):
    id: str
    name: str
    source_type: str
    provider: str
    url: Optional[str]
    branch: Optional[str]
    language: Optional[str]
    module_count: int
    file_count: int
    status: str
    knowledge_base_status: str
    error_message: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class RepositoryListResponse(BaseModel):
    repositories: list[RepositoryResponse]
    total: int


class KnowledgeBaseEntry(BaseModel):
    id: str
    entry_type: str
    file_path: Optional[str]
    content: str
    language: Optional[str]
    model_config = ConfigDict(from_attributes=True)


class KnowledgeBaseResponse(BaseModel):
    repository_id: str
    status: str
    entries: list[KnowledgeBaseEntry]
    total: int


class RepositoryFileResponse(BaseModel):
    repository_id: str
    path: str
    entry_type: str
    content: str
    mime_type: Optional[str] = None
    size: int


class RepositoryUploadResponse(BaseModel):
    id: str
    filename: str
    content_type: Optional[str] = None
    size: int
    uploaded_at: datetime
    uploaded_by: str


class RepositoryUploadListResponse(BaseModel):
    uploads: list[RepositoryUploadResponse]
    total: int


class ContributorResponse(BaseModel):
    id: str
    name: str
    email: str
    commit_count: int
    files_touched: Optional[int] = None
    lines_added: Optional[int] = None
    lines_deleted: Optional[int] = None
    prs_authored: Optional[int] = None
    top_files: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class ContributorListResponse(BaseModel):
    repository_id: str
    contributors: list[ContributorResponse]
    total: int


class AssignLearnerRequest(BaseModel):
    learner_id: str
    kt_topic_id: str | None = None


class AssignmentResponse(BaseModel):
    id: str
    repository_id: str
    kt_topic_id: Optional[str] = None
    kt_topic_title: Optional[str] = None
    learner_id: str
    learner_name: str
    learner_email: str
    status: str
    assigned_at: datetime


class AssignmentListResponse(BaseModel):
    assignments: list[AssignmentResponse]
    total: int


class MyAssignmentResponse(BaseModel):
    assignment_id: str
    repository_id: str
    repository_name: str
    kt_topic_id: Optional[str] = None
    kt_topic_title: Optional[str] = None
    kt_topic_description: Optional[str]
    status: str
    assigned_at: datetime
