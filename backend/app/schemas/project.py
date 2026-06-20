"""Pydantic schemas for project create and read operations."""

from datetime import datetime

from pydantic import BaseModel, HttpUrl


class ProjectBase(BaseModel):
    """Pydantic schema for ProjectBase payloads."""
    name: str
    repository_url: HttpUrl


class ProjectCreate(ProjectBase):
    """Pydantic schema for ProjectCreate payloads."""
    pass


class ProjectRead(ProjectBase):
    """Pydantic schema for ProjectRead payloads."""
    id: str
    status: str
    created_at: datetime
    updated_at: datetime
