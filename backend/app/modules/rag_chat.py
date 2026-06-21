"""Retrieval-augmented chat helpers for repository knowledge-base answers."""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge_base import KnowledgeBase
from app.modules.llm_client import LLMProvider
from app.modules.semantic_search import rank_relevant_entries

MAX_CONTEXT_CHARS = 5_000
FILENAME_PATTERN = re.compile(r"(?<!\w)([\w./\\-]+\.[A-Za-z0-9]+)")


def extract_mentioned_file(question: str) -> str | None:
    """Extract and normalize the first filename or file path in a question."""
    match = FILENAME_PATTERN.search(question)
    if match is None:
        return None
    return match.group(1).replace("\\", "/").lstrip("./").lower()


def entry_matches_file(entry: KnowledgeBase, mentioned_file: str) -> bool:
    """Return whether a knowledge-base entry belongs to the mentioned file."""
    if not entry.file_path:
        return False
    entry_path = entry.file_path.replace("\\", "/").lstrip("./").lower()
    return entry_path == mentioned_file or entry_path.endswith(f"/{mentioned_file}")


def build_context(repository_id: str, question: str, db: Session) -> tuple[str, list[str]]:
    """Build bounded context, prioritizing source for an explicitly named file."""
    entries = db.scalars(
        select(KnowledgeBase).where(KnowledgeBase.repository_id == repository_id)
    ).all()

    mentioned_file = extract_mentioned_file(question)
    readme_entry: KnowledgeBase | None = None
    exact_file_entries: list[KnowledgeBase] = []
    remaining_entries: list[KnowledgeBase] = []
    for entry in entries:
        if mentioned_file and entry_matches_file(entry, mentioned_file):
            exact_file_entries.append(entry)
        elif entry.entry_type == "readme" and readme_entry is None:
            readme_entry = entry
        else:
            remaining_entries.append(entry)

    exact_file_entries.sort(key=lambda entry: entry.entry_type != "source_file")
    ranked_entries = rank_relevant_entries(question, remaining_entries, top_k=5)
    entries_sorted = exact_file_entries + ([readme_entry] if readme_entry else []) + ranked_entries

    parts: list[str] = []
    sources: list[str] = []
    seen_entry_ids: set[str] = set()
    total_len = 0
    for entry in entries_sorted:
        if entry.id in seen_entry_ids:
            continue
        seen_entry_ids.add(entry.id)
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


def build_system_prompt(
    repository_name: str,
    language: str | None,
    context: str,
    mentioned_file: str | None = None,
) -> str:
    """Build a strictly grounded codebase assistant prompt."""
    file_not_found_rule = ""
    if mentioned_file and mentioned_file.lower() not in context.lower():
        file_not_found_rule = (
            f"- The user asked about '{mentioned_file}', but it is not anywhere in the retrieved context. "
            f"Say clearly: \"I couldn't find {mentioned_file} in the indexed codebase. "
            "It may not exist, wasn't indexed, or the repo needs to be re-analyzed.\" "
            "Do NOT speculate about what the file might do.\n"
        )
    return (
        f"You are a senior developer explaining the '{repository_name}' codebase "
        f"({language or 'unknown language'}) to an onboarding teammate.\n\n"
        "GROUNDING RULES:\n"
        "- Answer only from the codebase context below and cite specific file paths.\n"
        "- When a named file's source is present, explain its imports, functions/classes, "
        "control flow, and project role using that source.\n"
        "- Clearly label limited structural inferences; do not present them as confirmed behavior.\n"
        "- Never invent functionality, frameworks, libraries, files, or business domains absent from context.\n"
        "- If requested source is missing or truncated, say it was not fully indexed and explain only "
        "what the available context proves.\n"
        f"{file_not_found_rule}"
        "- Be direct and technically precise. Skip conversational filler.\n\n"
        "RESPONSE STYLE:\n"
        "- Start with the answer, not a canned heading such as 'Repository Overview'.\n"
        "- Prefer two or three short paragraphs. Use bullets only for genuinely distinct items.\n"
        "- Use at most three short Markdown headings when they materially improve readability.\n"
        "- Put file paths, symbols, and commands in backticks.\n"
        "- Do not repeat uncertainty in multiple sections. State one concise limitation when needed.\n"
        "- Do not infer a product's purpose from its repository name alone.\n\n"
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
    """Answer a repository question using retrieved, grounded context."""
    context, sources = build_context(repository_id, question, db)
    mentioned_file = extract_mentioned_file(question)
    system_prompt = build_system_prompt(repository_name, language, context, mentioned_file)
    user_prompt = f"{history_text}\nQuestion: {question}" if history_text else question
    return llm.complete(system_prompt, user_prompt), sources
