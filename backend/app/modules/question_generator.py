import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge_base import KnowledgeBase
from app.models.kt_topic import KTTopic
from app.modules.llm_client import LLMError, LLMProvider
from app.utils.path_matching import parse_path_patterns, path_matches_patterns

logger = logging.getLogger(__name__)

MAX_CONTEXT_CHARS = 8000
MAX_BATCH_QUESTIONS = 5
TOKENS_PER_QUESTION = 850


class AssessmentGenerationError(Exception):
    """Raised when assessment question generation cannot produce valid questions."""


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


def extract_json_array(content: str) -> str:
    text = strip_markdown_fences(content)
    if text.startswith("[") and text.endswith("]"):
        return text

    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return text
    return text[start : end + 1]


def parse_generated_questions_json(content: str) -> list[dict]:
    try:
        parsed = json.loads(strip_markdown_fences(content))
    except json.JSONDecodeError:
        parsed = json.loads(extract_json_array(content))

    if isinstance(parsed, list):
        return [item for item in parsed if isinstance(item, dict)]
    if isinstance(parsed, dict) and isinstance(parsed.get("questions"), list):
        return [item for item in parsed["questions"] if isinstance(item, dict)]
    raise AssessmentGenerationError("The AI model returned an unexpected response format.")


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
        repository_entries = db.scalars(
            select(KnowledgeBase)
            .where(KnowledgeBase.repository_id == topic.repository_id)
            .order_by(KnowledgeBase.created_at)
        ).all()
        entries = list(repository_entries)

        patterns = parse_path_patterns(topic.path_patterns)
        if patterns:
            entries = [
                entry
                for entry in entries
                if entry.file_path and path_matches_patterns(entry.file_path, patterns)
            ]

        if not entries:
            if repository_entries:
                logger.warning(
                    "No knowledge-base entries matched kt_topic_id=%s path_patterns=%s; falling back to repository context",
                    topic.id,
                    topic.path_patterns,
                )
                entries = list(repository_entries)
            else:
                raise AssessmentGenerationError(
                    "No knowledge-base content is available for this repository. Build the knowledge base before generating questions."
                )

        code_context = build_code_context(list(entries))
        system_prompt = (
            "You are an expert technical trainer. You create multiple-choice assessment questions "
            "STRICTLY based on the actual source code and documentation provided to you. "
            "Every question must reference real functions, classes, endpoints, models, or patterns "
            "found in the provided code context. Do not generate generic or theoretical questions "
            "that are not grounded in the provided codebase."
        )
        parsed_items: list[dict] = []

        for offset in range(0, num_questions, MAX_BATCH_QUESTIONS):
            batch_size = min(MAX_BATCH_QUESTIONS, num_questions - offset)
            user_prompt = f"""Repository: {topic.repository_id}
KT Topic: {topic.title}
Topic Description: {topic.description or 'N/A'}
Path Scope: {topic.path_patterns or 'Entire repository'}

The following is the actual source code and documentation from the repository scoped to this KT topic:

{code_context}

Generate exactly {batch_size} multiple-choice questions that test a learner's understanding of the ABOVE codebase.

STRICT RULES:
- Every question MUST reference something visible in the code context above (a real function name, class, endpoint path, variable, config key, error type, pattern, or architectural decision).
- Do NOT ask about general programming concepts not demonstrated in the code.
- Do NOT invent features, endpoints, or classes not present in the context.
- question_type = "single" if exactly one option is correct; "multi" if two or more are correct.
- At least 30% of questions must be "multi" type.
- Difficulty distribution: ~40% Easy, ~40% Medium, ~20% Hard.
- explanation: 1-2 sentences explaining the correct answer, referencing the specific code.
- This is batch {offset // MAX_BATCH_QUESTIONS + 1}; do not repeat question ideas from earlier batches.

Respond ONLY as a valid JSON array. No markdown, no explanation, only JSON.
Schema:
[
  {{
    "question_text": "string - must reference specific code/endpoint/class",
    "question_type": "single" | "multi",
    "options": [
      {{"label": "string", "is_correct": true | false}},
      {{"label": "string", "is_correct": false}},
      {{"label": "string", "is_correct": false}},
      {{"label": "string", "is_correct": false}}
    ],
    "explanation": "string - cite the specific code element that makes this correct",
    "difficulty": "Easy" | "Medium" | "Hard"
  }}
]
"""

            max_tokens = max(2048, batch_size * TOKENS_PER_QUESTION)
            response = llm.complete(system_prompt, user_prompt, max_tokens=max_tokens)
            try:
                parsed_batch = parse_generated_questions_json(response)
            except json.JSONDecodeError as exc:
                logger.warning(
                    "Assessment generation returned invalid JSON for kt_topic_id=%s batch=%s: %s",
                    topic.id,
                    offset // MAX_BATCH_QUESTIONS + 1,
                    exc,
                )
                raise AssessmentGenerationError(
                    "The AI model returned invalid JSON. Try fewer questions or retry generation."
                ) from exc
            parsed_items.extend(parsed_batch)
    except AssessmentGenerationError:
        raise
    except LLMError as exc:
        logger.warning("Assessment generation LLM call failed for kt_topic_id=%s: %s", topic.id, exc)
        raise AssessmentGenerationError(
            "The AI model did not respond in time. Try fewer questions, restart Ollama, or increase OLLAMA_TIMEOUT_SECONDS."
        ) from exc
    except Exception:
        logger.exception("Assessment generation failed before parsing for kt_topic_id=%s", topic.id)
        raise AssessmentGenerationError("Assessment generation failed before the AI response could be parsed.")

    results: list[dict] = []
    for item in parsed_items[:num_questions]:
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

    if not results:
        raise AssessmentGenerationError(
            "The AI response did not contain valid questions. Try fewer questions or improve the topic knowledge-base content."
        )

    return results[:num_questions]
