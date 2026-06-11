from datetime import datetime

from pydantic import BaseModel, HttpUrl


class ProjectBase(BaseModel):
    name: str
    repository_url: HttpUrl


class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    id: str
    status: str
    created_at: datetime
    updated_at: datetime
