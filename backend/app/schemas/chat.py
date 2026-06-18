from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ChatMessageItem(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ChatHistoryResponse(BaseModel):
    repository_id: str
    messages: list[ChatMessageItem]


class PostChatMessageRequest(BaseModel):
    content: str


class ChatMessageResponse(BaseModel):
    user_message: ChatMessageItem
    assistant_message: ChatMessageItem
