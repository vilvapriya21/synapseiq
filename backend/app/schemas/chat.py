from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChatMessageItem(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime
    sources: list[str] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


class ChatHistoryResponse(BaseModel):
    repository_id: str
    messages: list[ChatMessageItem]


class PostChatMessageRequest(BaseModel):
    content: str


class ChatMessageResponse(BaseModel):
    user_message: ChatMessageItem
    assistant_message: ChatMessageItem
