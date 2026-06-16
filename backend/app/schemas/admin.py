from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserListItem(BaseModel):
    id: str
    name: str
    email: str
    role: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class CreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "learner"


class UpdateRoleRequest(BaseModel):
    role: str
