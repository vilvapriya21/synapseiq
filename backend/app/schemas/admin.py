"""Pydantic schemas for administrator user-management payloads."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserListItem(BaseModel):
    """Pydantic schema for UserListItem payloads."""
    id: str
    name: str
    email: str
    role: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class CreateUserRequest(BaseModel):
    """Pydantic schema for CreateUserRequest payloads."""
    name: str
    email: str
    password: str
    role: str = "learner"


class UpdateRoleRequest(BaseModel):
    """Pydantic schema for UpdateRoleRequest payloads."""
    role: str
