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


def strip_markdown_fences(content: str) -> str:
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


def generate_assessment_questions(
    topic: KTTopic,
    num_questions: int,
    db: Session,
    llm: LLMProvider,
) -> list[dict]:
    """
    Uses KnowledgeBase entries for the topic's repository to generate MCQ questions.
    Returns a list of dicts matching the generated question schema.
    """
    try:
        entries = db.scalars(
            select(KnowledgeBase)
            .where(KnowledgeBase.repository_id == topic.repository_id)
            .order_by(KnowledgeBase.created_at)
        ).all()

        patterns = parse_path_patterns(topic.path_patterns)
        if patterns:
            entries = [
                entry
                for entry in entries
                if entry.file_path and path_matches_patterns(entry.file_path, patterns)
            ]

        code_context = build_code_context(list(entries))
        system_prompt = (
            "You are an expert technical trainer creating rigorous multiple-choice "
            "assessments for software engineering teams."
        )
        user_prompt = f"""
Topic: {topic.title}
Description: {topic.description or 'N/A'}

Code context from the repository:
{code_context}

Generate exactly {num_questions} multiple-choice questions to assess a learner's understanding of this KT topic.

Rules:
- Each question must have exactly 4 options (labeled as short answer strings, not A/B/C/D).
- question_type must be "single" if exactly one option is correct, "multi" if two or more are correct.
- At least 30% of questions should be "multi" type.
- Vary difficulty: roughly 40% Easy, 40% Medium, 20% Hard.
- explanation: a 1-2 sentence explanation of the correct answer(s).
- Base questions on the actual code context provided. Do not invent features not present.

Respond ONLY as a valid JSON array. No markdown. No explanation. Only JSON.
Schema:
[
  {{
    "question_text": "string",
    "question_type": "single" | "multi",
    "options": [
      {{"label": "string", "is_correct": true | false}},
      {{"label": "string", "is_correct": false}},
      {{"label": "string", "is_correct": false}},
      {{"label": "string", "is_correct": false}}
    ],
    "explanation": "string",
    "difficulty": "Easy" | "Medium" | "Hard"
  }}
]
"""

        response = llm.complete(system_prompt, user_prompt)
    except LLMError as exc:
        logger.warning("Assessment generation LLM call failed for kt_topic_id=%s: %s", topic.id, exc)
        return []
    except Exception:
        logger.exception("Assessment generation failed before parsing for kt_topic_id=%s", topic.id)
        return []

    try:
        parsed = json.loads(strip_markdown_fences(response))
    except json.JSONDecodeError:
        logger.warning("Assessment generation returned invalid JSON for kt_topic_id=%s", topic.id)
        return []

    if not isinstance(parsed, list):
        logger.warning("Assessment generation returned non-list JSON for kt_topic_id=%s", topic.id)
        return []

    results: list[dict] = []
    for item in parsed[:num_questions]:
        if not isinstance(item, dict):
            continue
        question_text = item.get("question_text")
        question_type = item.get("question_type")
        explanation = item.get("explanation")
        difficulty = item.get("difficulty")
        options = item.get("options")
        if not isinstance(question_text, str) or not question_text.strip():
            continue
        if question_type not in {"single", "multi"}:
            continue
        if difficulty not in {"Easy", "Medium", "Hard"}:
            continue
        if not isinstance(options, list) or len(options) != 4:
            continue

        safe_options = []
        for option in options:
            if not isinstance(option, dict):
                break
            label = option.get("label")
            is_correct = option.get("is_correct")
            if not isinstance(label, str) or not label.strip():
                break
            if not isinstance(is_correct, bool):
                break
            safe_options.append({
                "label": label.strip(),
                "is_correct": is_correct,
            })
        else:
            results.append(
                {
                    "question_text": question_text.strip(),
                    "question_type": question_type,
                    "options": safe_options,
                    "explanation": explanation.strip() if isinstance(explanation, str) else "",
                    "difficulty": difficulty,
                }
            )

    return results[:num_questions]
