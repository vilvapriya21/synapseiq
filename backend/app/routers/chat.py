"""API endpoints for repository chat history and RAG answers."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.llm_dependency import get_llm
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.chat_message import ChatMessage
from app.models.user import User
from app.modules.llm_client import LLMError, LLMProvider
from app.modules.rag_chat import answer_question
from app.routers.repository import get_accessible_repository
from app.schemas.chat import (
    ChatHistoryResponse,
    ChatMessageItem,
    ChatMessageResponse,
    PostChatMessageRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)

HISTORY_LIMIT = 50
CONTEXT_TURNS_FOR_PROMPT = 6


@router.get("/{repo_id}/chat", response_model=ChatHistoryResponse)
def get_chat_history(
    repo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatHistoryResponse:
    """Return the chat history for the current operation.

    Args:
        repo_id: Repository identifier.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    get_accessible_repository(db, repo_id, current_user)

    messages = db.scalars(
        select(ChatMessage)
        .where(
            ChatMessage.repository_id == repo_id,
            ChatMessage.user_id == current_user.id,
        )
        .order_by(ChatMessage.created_at)
        .limit(HISTORY_LIMIT)
    ).all()

    return ChatHistoryResponse(repository_id=repo_id, messages=messages)


@router.post("/{repo_id}/chat", response_model=ChatMessageResponse)
def post_chat_message(
    repo_id: str,
    payload: PostChatMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm: LLMProvider = Depends(get_llm),
) -> ChatMessageResponse:
    """Handle post chat message for the current operation.

    Args:
        repo_id: Repository identifier.
        payload: Validated request body for the operation.
        db: Database session used for persistence and queries.
        current_user: Authenticated user associated with the request.
        llm: LLM provider used for generation.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    repository = get_accessible_repository(db, repo_id, current_user)

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")

    if repository.knowledge_base_status != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Knowledge base is still building for this repository. Try again shortly.",
        )

    user_message = ChatMessage(
        repository_id=repo_id,
        user_id=current_user.id,
        role="user",
        content=content,
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    recent = db.scalars(
        select(ChatMessage)
        .where(
            ChatMessage.repository_id == repo_id,
            ChatMessage.user_id == current_user.id,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(CONTEXT_TURNS_FOR_PROMPT)
    ).all()
    recent_in_order = list(reversed(recent))[:-1]
    history_text = "\n".join(
        f"{'User' if message.role == 'user' else 'Assistant'}: {message.content}" for message in recent_in_order
    )

    try:
        answer_text, sources = answer_question(
            repository_id=repo_id,
            repository_name=repository.name,
            language=repository.language,
            question=content,
            history_text=history_text,
            db=db,
            llm=llm,
        )
    except LLMError as exc:
        logger.warning("Chat LLM call failed for repository_id=%s: %s", repo_id, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI assistant is temporarily unavailable: {exc}",
        ) from exc

    assistant_message = ChatMessage(
        repository_id=repo_id,
        user_id=current_user.id,
        role="assistant",
        content=answer_text,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    response_assistant = ChatMessageItem.model_validate(assistant_message)
    response_assistant.sources = sources

    return ChatMessageResponse(
        user_message=user_message,
        assistant_message=response_assistant,
    )
