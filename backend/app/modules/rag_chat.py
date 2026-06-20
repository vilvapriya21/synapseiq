"""Retrieval-augmented chat helpers for repository knowledge-base answers."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge_base import KnowledgeBase
from app.modules.llm_client import LLMProvider
from app.modules.semantic_search import rank_relevant_entries

MAX_CONTEXT_CHARS = 8000


def build_context(repository_id: str, question: str, db: Session) -> tuple[str, list[str]]:
    """Build a bounded RAG context string for a repository question.

    Keeps README content first when present, then appends entries ranked as most relevant
    to the current question until the context budget is reached.

    Args:
        repository_id: Repository identifier whose knowledge base should be queried.
        question: User question used to rank relevant entries.
        db: Database session used to load knowledge-base entries.

    Returns:
        Tuple containing the context text and source labels included in that context.
    """
    entries = db.scalars(
        select(KnowledgeBase).where(KnowledgeBase.repository_id == repository_id)
    ).all()

    readme_entry: KnowledgeBase | None = None
    remaining_entries: list[KnowledgeBase] = []
    for entry in entries:
        if entry.entry_type == "readme" and readme_entry is None:
            readme_entry = entry
        else:
            remaining_entries.append(entry)

    ranked_entries = rank_relevant_entries(question, remaining_entries, top_k=6)
    entries_sorted = ([readme_entry] if readme_entry else []) + ranked_entries

    parts: list[str] = []
    sources: list[str] = []
    total_len = 0
    for entry in entries_sorted:
        label = entry.file_path or entry.entry_type
        block = f"### {label}\n{entry.content}\n\n"
        if total_len + len(block) > MAX_CONTEXT_CHARS:
            remaining = MAX_CONTEXT_CHARS - total_len
            if remaining > 200:
                parts.append(block[:remaining] + "\n...(truncated)")
                sources.append(label)
            break
        parts.append(block)
        sources.append(label)
        total_len += len(block)

    return "".join(parts), sources


def build_system_prompt(repository_name: str, language: str | None, context: str) -> str:
    """Build system prompt for the current operation.

    Args:
        repository_name: repository_name value used by the operation.
        language: language value used by the operation.
        context: context value used by the operation.

    Returns:
        Result produced by the operation.
    """
    return (
        f"You are a knowledge transfer assistant helping a team member understand "
        f"the '{repository_name}' codebase ({language or 'unknown language'}). "
        f"Answer questions using ONLY the information in the context below. "
        f"If the answer isn't in the provided context, say clearly that you don't "
        f"have enough information from the indexed codebase, and suggest checking "
        f"with a contributor or reading the relevant file directly. Be concise and "
        f"reference specific files or modules when relevant.\n\n"
        f"=== CODEBASE CONTEXT ===\n{context}\n=== END CONTEXT ==="
    )


def answer_question(
    repository_id: str,
    repository_name: str,
    language: str | None,
    question: str,
    history_text: str,
    db: Session,
    llm: LLMProvider,
) -> tuple[str, list[str]]:
    """Handle answer question for the current operation.

    Args:
        repository_id: repository_id value used by the operation.
        repository_name: repository_name value used by the operation.
        language: language value used by the operation.
        question: question value used by the operation.
        history_text: history_text value used by the operation.
        db: Database session used for persistence and queries.
        llm: LLM provider used for generation.

    Returns:
        Result produced by the operation.
    """
    context, sources = build_context(repository_id, question, db)
    system_prompt = build_system_prompt(repository_name, language, context)
    user_prompt = f"{history_text}\nQuestion: {question}" if history_text else question
    return llm.complete(system_prompt, user_prompt), sources
