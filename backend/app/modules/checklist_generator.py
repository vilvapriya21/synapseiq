"""LLM-powered checklist generation for KT topics."""

import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge_base import KnowledgeBase
from app.models.kt_topic import KTTopic
from app.modules.llm_client import LLMError, LLMProvider
from app.utils.path_matching import parse_path_patterns, path_matches_patterns

logger = logging.getLogger(__name__)

MAX_CONTEXT_CHARS = 12000


def fallback_checklist_items(topic: KTTopic) -> list[dict]:
    """Return a useful baseline checklist when AI generation is unavailable."""
    scope = topic.path_patterns or "the relevant repository files"
    return [
        {
            "title": f"Review the {topic.title} scope",
            "description": f"Identify the main files and responsibilities related to {scope}.",
            "source": scope,
        },
        {
            "title": "Trace the main execution flow",
            "description": "Follow the entry points, key functions, and data flow from input to output.",
            "source": scope,
        },
        {
            "title": "Review dependencies and integrations",
            "description": "Document the internal modules and external services used by this topic.",
            "source": scope,
        },
        {
            "title": "Inspect validation and error handling",
            "description": "Review expected failures, validation rules, logging, and recovery behavior.",
            "source": scope,
        },
        {
            "title": "Verify the topic with a practical walkthrough",
            "description": "Run or test the relevant flow and record the important setup and troubleshooting steps.",
            "source": scope,
        },
    ]


def strip_markdown_fences(content: str) -> str:
    """Handle strip markdown fences for the current operation.

    Args:
        content: File content or text being inspected.

    Returns:
        Result produced by the operation.
    """
    text = content.strip()
    if not text.startswith("```"):
        return text

    lines = text.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def build_code_context(entries: list[KnowledgeBase]) -> str:
    """Build code context for the current operation.

    Args:
        entries: entries value used by the operation.

    Returns:
        Result produced by the operation.
    """
    chunks: list[str] = []
    remaining = MAX_CONTEXT_CHARS

    for entry in entries:
        label = entry.file_path or entry.entry_type
        chunk = f"### {label}\n{entry.content}\n"
        if remaining <= 0:
            break
        chunks.append(chunk[:remaining])
        remaining -= len(chunks[-1])

    return "\n".join(chunks)


def generate_checklist_items(topic: KTTopic, db: Session, llm: LLMProvider) -> list[dict]:
    """Handle generate checklist items for the current operation.

    Args:
        topic: topic value used by the operation.
        db: Database session used for persistence and queries.
        llm: LLM provider used for generation.

    Returns:
        Result produced by the operation.
    """
    try:
        entries = db.scalars(
            select(KnowledgeBase)
            .where(KnowledgeBase.repository_id == topic.repository_id)
            .order_by(KnowledgeBase.created_at)
        ).all()

        patterns = parse_path_patterns(topic.path_patterns)
        if patterns:
            matching_entries = [
                entry
                for entry in entries
                if entry.file_path and path_matches_patterns(entry.file_path, patterns)
            ]
            if matching_entries:
                entries = matching_entries
            else:
                logger.warning(
                    "No files matched path scope for kt_topic_id=%s; using repository context",
                    topic.id,
                )

        code_context = build_code_context(list(entries))
        system_prompt = "You generate precise knowledge-transfer checklists for software teams."
        user_prompt = (
            f"KT Topic: '{topic.title}'\n"
            f"Description: {topic.description or 'N/A'}\n"
            f"Path scope: {topic.path_patterns or 'Entire repository'}\n\n"
            "Based on the source code below, generate 5-8 checklist items a new team member must "
            "complete to understand this KT topic. Each item should be directly traceable to a "
            "specific file, module, class, or pattern in the code.\n\n"
            "Respond ONLY as a JSON array. No markdown. Only JSON.\n"
            'Schema: [{"title": str, "description": str, "source": str}]\n'
            "- title: short action phrase (e.g. 'Review the AuthService class')\n"
            "- description: 1-2 sentences explaining what to look at and why\n"
            "- source: the specific file path or module name from the code that this item relates to\n\n"
            f"Code context:\n{code_context}"
        )

        response = llm.complete(system_prompt, user_prompt)
    except LLMError as exc:
        logger.warning("Checklist generation LLM call failed for kt_topic_id=%s: %s", topic.id, exc)
        return fallback_checklist_items(topic)
    except Exception:
        logger.exception("Checklist generation failed before parsing for kt_topic_id=%s", topic.id)
        return fallback_checklist_items(topic)

    try:
        parsed = json.loads(strip_markdown_fences(response))
    except json.JSONDecodeError:
        logger.warning("Checklist generation returned invalid JSON for kt_topic_id=%s", topic.id)
        return fallback_checklist_items(topic)

    if not isinstance(parsed, list):
        logger.warning("Checklist generation returned non-list JSON for kt_topic_id=%s", topic.id)
        return fallback_checklist_items(topic)

    items: list[dict] = []
    for item in parsed[:8]:
        if not isinstance(item, dict):
            continue
        title = item.get("title")
        if not isinstance(title, str) or not title.strip():
            continue
        description = item.get("description")
        items.append(
            {
                "title": title.strip(),
                "description": description.strip() if isinstance(description, str) else None,
                "source": item.get("source", "").strip() if isinstance(item.get("source"), str) else None,
            }
        )

    return items or fallback_checklist_items(topic)
