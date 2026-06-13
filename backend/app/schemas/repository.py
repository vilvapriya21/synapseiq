from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class RepositoryConnectRequest(BaseModel):
    url: str
    branch: str = "main"


class RepositoryResponse(BaseModel):
    id: str
    name: str
    source_type: str
    url: Optional[str]
    branch: Optional[str]
    language: Optional[str]
    module_count: int
    status: str
    error_message: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class RepositoryListResponse(BaseModel):
    repositories: list[RepositoryResponse]
    total: int
