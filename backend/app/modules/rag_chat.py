from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge_base import KnowledgeBase
from app.modules.llm_client import LLMProvider

MAX_CONTEXT_CHARS = 8000


def build_context(repository_id: str, db: Session) -> str:
    """
    Concatenates the repository's knowledge base entries into a single
    context string, capped at MAX_CONTEXT_CHARS. Prioritizes README and
    file_tree first since they give the LLM the best overview, then
    module summaries and dependencies.
    """
    entries = db.scalars(
        select(KnowledgeBase).where(KnowledgeBase.repository_id == repository_id)
    ).all()

    priority = {"readme": 0, "file_tree": 1, "module_summary": 2, "dependencies": 3, "function_index": 4}
    entries_sorted = sorted(entries, key=lambda e: priority.get(e.entry_type, 9))

    parts: list[str] = []
    total_len = 0
    for entry in entries_sorted:
        label = entry.file_path or entry.entry_type
        block = f"### {label}\n{entry.content}\n\n"
        if total_len + len(block) > MAX_CONTEXT_CHARS:
            remaining = MAX_CONTEXT_CHARS - total_len
            if remaining > 200:
                parts.append(block[:remaining] + "\n...(truncated)")
            break
        parts.append(block)
        total_len += len(block)

    return "".join(parts)


def build_system_prompt(repository_name: str, language: str | None, context: str) -> str:
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
) -> str:
    context = build_context(repository_id, db)
    system_prompt = build_system_prompt(repository_name, language, context)
    user_prompt = f"{history_text}\nQuestion: {question}" if history_text else question
    return llm.complete(system_prompt, user_prompt)
