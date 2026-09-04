"""Pydantic schemas for repository chat messages and responses."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChatMessageItem(BaseModel):
    """Pydantic schema for ChatMessageItem payloads."""
    id: str
    role: str
    content: str
    created_at: datetime
    sources: list[str] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


class ChatHistoryResponse(BaseModel):
    """Pydantic schema for ChatHistoryResponse payloads."""
    repository_id: str
    messages: list[ChatMessageItem]


class PostChatMessageRequest(BaseModel):
    """Pydantic schema for PostChatMessageRequest payloads."""
    content: str


class ChatMessageResponse(BaseModel):
    """Pydantic schema for ChatMessageResponse payloads."""
    user_message: ChatMessageItem
    assistant_message: ChatMessageItem
