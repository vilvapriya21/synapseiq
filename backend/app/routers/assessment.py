"""API endpoints for assessment generation, assignment, submission, and results."""

import logging
from datetime import datetime, timezone
from typing import cast
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.llm_dependency import get_llm
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.assessment import (
    Assessment,
    AssessmentAttempt,
    AssessmentAttemptAnswer,
    AssessmentOption,
    AssessmentQuestion,
)
from app.models.kt_topic import KTTopic
from app.models.repository import Repository
from app.models.repository_assignment import RepositoryAssignment
from app.models.user import User
from app.modules.llm_client import LLMProvider
from app.modules.question_generator import AssessmentGenerationError, generate_assessment_questions
from app.routers.admin import require_admin
from app.routers.kt_topic import is_learner
from app.routers.repository import get_owned_repository
from app.schemas.assessment import (
    AssessmentLearnerView,
    AssessmentListItem,
    AssessmentOptionLearnerView,
    AssessmentOptionResponse,
    AssessmentQuestionLearnerView,
    AssessmentQuestionResponse,
    AssessmentResponse,
    AssignAssessmentRequest,
    AttemptResultResponse,
    GenerateQuestionsRequest,
    GenerateQuestionsResponse,
    GeneratedQuestion,
    LearnerAttemptSummary,
    OrphanedAssessmentReport,
    PerQuestionResult,
    SaveAssessmentRequest,
    SubmitAttemptRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _serialize_option(option: AssessmentOption) -> AssessmentOptionResponse:
    """Handle serialize option for the current operation.

    Args:
        option: option value used by the operation.

    Returns:
        Result produced by the operation.
    """
    return AssessmentOptionResponse(
        id=option.id,
        label=option.label,
        is_correct=option.is_correct,
        order=option.order,
    )


def _serialize_question(question: AssessmentQuestion) -> AssessmentQuestionResponse:
    """Handle serialize question for the current operation.

    Args:
        question: question value used by the operation.

    Returns:
        Result produced by the operation.
    """
    return AssessmentQuestionResponse(
        id=question.id,
        question_text=question.question_text,
        question_type=question.question_type,
        options=[],
        explanation=question.explanation,
        difficulty=question.difficulty,
        order=question.order,
    )


def _serialize_learner_question(question: AssessmentQuestion) -> AssessmentQuestionLearnerView:
    """Handle serialize learner question for the current operation.

    Args:
        question: question value used by the operation.

    Returns:
        Result produced by the operation.
    """
    return AssessmentQuestionLearnerView(
        id=question.id,
        question_text=question.question_text,
        question_type=question.question_type,
        options=[],
        order=question.order,
    )


def _assessment_response(
    db: Session,
    assessment: Assessment,
    include_correct: bool,
) -> AssessmentResponse | AssessmentLearnerView:
    """Handle assessment response for the current operation.

    Args:
        db: Database session used for persistence and queries.
        assessment: assessment value used by the operation.
        include_correct: include_correct value used by the operation.

    Returns:
        Result produced by the operation.
    """
    questions = db.scalars(
        select(AssessmentQuestion)
        .where(AssessmentQuestion.assessment_id == assessment.id)
        .order_by(AssessmentQuestion.order)
    ).all()

    serialized_questions = []
    for question in questions:
        options = db.scalars(
            select(AssessmentOption)
            .where(AssessmentOption.question_id == question.id)
            .order_by(AssessmentOption.order)
        ).all()

        if include_correct:
            serialized_questions.append(
                AssessmentQuestionResponse(
                    id=question.id,
                    question_text=question.question_text,
                    question_type=question.question_type,
                    options=[_serialize_option(option) for option in options],
                    explanation=question.explanation,
                    difficulty=question.difficulty,
                    order=question.order,
                )
            )
        else:
            serialized_questions.append(
                AssessmentQuestionLearnerView(
                    id=question.id,
                    question_text=question.question_text,
                    question_type=question.question_type,
                    options=[
                        AssessmentOptionLearnerView(
                            id=option.id,
                            label=option.label,
                            order=option.order,
                        )
                        for option in options
                    ],
                    order=question.order,
                )
            )

    if include_correct:
        return AssessmentResponse(
            id=assessment.id,
            kt_topic_id=assessment.kt_topic_id,
            title=assessment.title,
            duration_minutes=assessment.duration_minutes,
            created_at=assessment.created_at,
            assigned_to=assessment.assigned_to,
            questions=serialized_questions,
        )

    return AssessmentLearnerView(
        id=assessment.id,
        kt_topic_id=assessment.kt_topic_id,
        title=assessment.title,
        duration_minutes=assessment.duration_minutes,
        questions=serialized_questions,
    )


def _get_assessment_or_404(db: Session, assessment_id: str) -> Assessment:
    """Return the assessment or 404 for the current operation.

    Args:
        db: Database session used for persistence and queries.
        assessment_id: assessment_id value used by the operation.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    assessment = db.get(Assessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
    return assessment


def _require_assigned_learner(assessment: Assessment, current_user: User) -> None:
    """Handle require assigned learner for the current operation.

    Args:
        assessment: assessment value used by the operation.
        current_user: Authenticated user associated with the request.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    if not is_learner(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Learner access required")
    if assessment.assigned_to != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Assessment is not assigned to this learner")


def _validate_assessment_learner_assignment(db: Session, kt_topic_id: str, learner_id: str) -> None:
    """Ensure the target learner can receive an assessment for the KT topic.

    Args:
        db: Database session used for persistence and queries.
        kt_topic_id: KT topic that owns the assessment.
        learner_id: Candidate learner id.

    Raises:
        HTTPException: If the user is missing, not a learner, or lacks the topic assignment.
    """
    learner = db.get(User, learner_id)
    if learner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learner not found")
    if not is_learner(learner):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be a learner")
    has_assignment = db.scalar(
        select(RepositoryAssignment).where(
            RepositoryAssignment.kt_topic_id == kt_topic_id,
            RepositoryAssignment.learner_id == learner_id,
        )
    )
    if not has_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This learner is not assigned to the topic this assessment belongs to",
        )


@router.post("/generate-questions", response_model=GenerateQuestionsResponse)
def generate_questions(
    payload: GenerateQuestionsRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
    llm: LLMProvider = Depends(get_llm),
) -> GenerateQuestionsResponse:
    """Handle generate questions for the current operation.

    Args:
        payload: Validated request body for the operation.
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.
        llm: LLM provider used for generation.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    topic = db.get(KTTopic, payload.kt_topic_id)
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    get_owned_repository(db, topic.repository_id, current_user.id)
    try:
        generated = generate_assessment_questions(topic, payload.num_questions, db, llm)
    except AssessmentGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    if not generated:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI generation failed. Please retry.",
        )

    return GenerateQuestionsResponse(
        questions=[
            GeneratedQuestion(
                question_text=item["question_text"],
                question_type=item["question_type"],
                options=[
                    {
                        "label": option["label"],
                        "is_correct": option["is_correct"],
                    }
                    for option in item.get("options", [])
                ],
                explanation=item.get("explanation", ""),
                difficulty=item.get("difficulty", "Easy"),
            )
            for item in generated
        ]
    )


@router.post("/", response_model=AssessmentResponse)
def save_assessment(
    payload: SaveAssessmentRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AssessmentResponse:
    """Handle save assessment for the current operation.

    Args:
        payload: Validated request body for the operation.
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")

    validated_questions = []
    for index, question in enumerate(payload.questions):
        question_text = question.question_text.strip()
        if not question_text:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Question text is required")
        if len(question.options) != 4 or any(not option.label.strip() for option in question.options):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each question requires exactly 4 non-empty options")
        if not any(option.is_correct for option in question.options):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each question requires at least one correct option")

        validated_questions.append(
            (
                index,
                question_text,
                question.question_type,
                question.explanation.strip() if question.explanation else None,
                question.difficulty,
                [(option_index, option.label.strip(), option.is_correct) for option_index, option in enumerate(question.options)],
            )
        )

    topic = db.get(KTTopic, payload.kt_topic_id)
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    get_owned_repository(db, topic.repository_id, current_user.id)
    if payload.assigned_to:
        _validate_assessment_learner_assignment(db, topic.id, payload.assigned_to)

    assessment = Assessment(
        id=str(uuid4()),
        kt_topic_id=payload.kt_topic_id,
        repository_id=topic.repository_id,
        title=title,
        duration_minutes=payload.duration_minutes,
        created_by=current_user.id,
        assigned_to=payload.assigned_to,
    )

    records: list[object] = [assessment]
    for index, question_text, question_type, explanation, difficulty, options in validated_questions:
        question_id = str(uuid4())
        question_record = AssessmentQuestion(
            id=question_id,
            assessment_id=assessment.id,
            question_text=question_text,
            question_type=question_type,
            explanation=explanation,
            difficulty=difficulty,
            order=index,
        )
        records.append(question_record)

        records.extend(
            [
                AssessmentOption(
                    question_id=question_id,
                    label=label,
                    is_correct=is_correct,
                    order=option_index,
                )
                for option_index, label, is_correct in options
            ]
        )

    db.add_all(records)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Assessment could not be saved. No assessment data was written.",
        ) from exc

    db.refresh(assessment)
    return cast(AssessmentResponse, _assessment_response(db, assessment, include_correct=True))


@router.get("/maintenance/orphaned-assessments", response_model=list[OrphanedAssessmentReport])
def list_orphaned_assessments(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[OrphanedAssessmentReport]:
    """List assessments with no linked questions for manual review.

    Args:
        current_user: Authenticated admin associated with the request.
        db: Database session used for persistence and queries.

    Returns:
        Assessments that have zero question rows.
    """
    question_count = func.count(AssessmentQuestion.id).label("question_count")
    rows = db.execute(
        select(Assessment, question_count)
        .outerjoin(AssessmentQuestion, AssessmentQuestion.assessment_id == Assessment.id)
        .group_by(Assessment.id)
        .having(question_count == 0)
        .order_by(Assessment.created_at.desc())
    ).all()

    reports = []
    for assessment, count in rows:
        topic = db.get(KTTopic, assessment.kt_topic_id)
        repo = db.get(Repository, assessment.repository_id)
        reports.append(
            OrphanedAssessmentReport(
                id=assessment.id,
                kt_topic_id=assessment.kt_topic_id,
                repository_id=assessment.repository_id,
                title=assessment.title,
                created_at=assessment.created_at,
                created_by=assessment.created_by,
                assigned_to=assessment.assigned_to,
                question_count=count,
                kt_topic_title=topic.title if topic else "",
                repository_name=repo.name if repo else "",
            )
        )

    return reports


@router.get("/active", response_model=list[AssessmentListItem])
def list_active_assessments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AssessmentListItem]:
    """List active assessments for the current user.

    Args:
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.

    Returns:
        Result produced by the operation.
    """
    if current_user.role.lower() == "admin":
        assessments = db.scalars(
            select(Assessment).where(Assessment.created_by == current_user.id)
        ).all()
    else:
        assessments = db.scalars(
            select(Assessment).where(Assessment.assigned_to == current_user.id)
        ).all()

    results = []
    for assessment in assessments:
        topic = db.get(KTTopic, assessment.kt_topic_id)
        repo = db.get(Repository, assessment.repository_id)
        has_submitted = False
        if current_user.role.lower() != "admin":
            submitted_attempt = db.scalar(
                select(AssessmentAttempt).where(
                    AssessmentAttempt.assessment_id == assessment.id,
                    AssessmentAttempt.learner_id == current_user.id,
                    AssessmentAttempt.submitted_at.isnot(None),
                )
            )
            has_submitted = submitted_attempt is not None

        results.append(
            AssessmentListItem(
                id=assessment.id,
                kt_topic_id=assessment.kt_topic_id,
                repository_id=assessment.repository_id,
                title=assessment.title,
                duration_minutes=assessment.duration_minutes,
                created_at=assessment.created_at,
                assigned_to=assessment.assigned_to,
                kt_topic_title=topic.title if topic else "",
                repository_name=repo.name if repo else "",
                has_submitted=has_submitted,
            )
        )

    return results


@router.get("/by-topic/{kt_topic_id}", response_model=AssessmentResponse | AssessmentLearnerView | None)
def get_assessment_by_topic(
    kt_topic_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssessmentResponse | AssessmentLearnerView | None:
    """Return the assessment by topic for the current operation.

    Args:
        kt_topic_id: kt_topic_id value used by the operation.
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    topic = db.get(KTTopic, kt_topic_id)
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    assessment = None
    if current_user.role.lower() == "admin":
        get_owned_repository(db, topic.repository_id, current_user.id)
        assessment = db.scalar(select(Assessment).where(Assessment.kt_topic_id == kt_topic_id))
        if assessment is None:
            return None
        include_correct = True
    else:
        if not is_learner(current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        assessment = db.scalar(
            select(Assessment).where(
                Assessment.kt_topic_id == kt_topic_id,
                Assessment.assigned_to == current_user.id,
            )
        )
        if assessment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
        include_correct = False

    if assessment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    return _assessment_response(db, assessment, include_correct=include_correct)


@router.patch("/{assessment_id}/assign", response_model=AssessmentResponse)
def assign_assessment(
    assessment_id: str,
    payload: AssignAssessmentRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AssessmentResponse:
    """Handle assign assessment for the current operation.

    Args:
        assessment_id: assessment_id value used by the operation.
        payload: Validated request body for the operation.
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    assessment = _get_assessment_or_404(db, assessment_id)
    get_owned_repository(db, assessment.repository_id, current_user.id)
    _validate_assessment_learner_assignment(db, assessment.kt_topic_id, payload.assigned_to)

    assessment.assigned_to = payload.assigned_to
    db.commit()
    db.refresh(assessment)
    return cast(AssessmentResponse, _assessment_response(db, assessment, include_correct=True))


@router.delete("/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assessment(
    assessment_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Delete the requested assessment resource.

    Args:
        assessment_id: assessment_id value used by the operation.
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.
    """
    assessment = _get_assessment_or_404(db, assessment_id)
    get_owned_repository(db, assessment.repository_id, current_user.id)

    question_ids = list(
        db.scalars(
            select(AssessmentQuestion.id).where(AssessmentQuestion.assessment_id == assessment.id)
        ).all()
    )
    attempt_ids = list(
        db.scalars(
            select(AssessmentAttempt.id).where(AssessmentAttempt.assessment_id == assessment.id)
        ).all()
    )

    if attempt_ids:
        db.execute(
            sql_delete(AssessmentAttemptAnswer).where(
                AssessmentAttemptAnswer.attempt_id.in_(attempt_ids)
            )
        )
    if question_ids:
        db.execute(
            sql_delete(AssessmentAttemptAnswer).where(
                AssessmentAttemptAnswer.question_id.in_(question_ids)
            )
        )
        db.execute(
            sql_delete(AssessmentOption).where(AssessmentOption.question_id.in_(question_ids))
        )

    db.execute(
        sql_delete(AssessmentAttempt).where(AssessmentAttempt.assessment_id == assessment.id)
    )
    db.execute(
        sql_delete(AssessmentQuestion).where(AssessmentQuestion.assessment_id == assessment.id)
    )
    db.delete(assessment)
    db.commit()


@router.post("/{assessment_id}/start")
def start_attempt(
    assessment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Handle start attempt for the current operation.

    Args:
        assessment_id: assessment_id value used by the operation.
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.
    """
    assessment = _get_assessment_or_404(db, assessment_id)
    _require_assigned_learner(assessment, current_user)

    existing = db.scalar(
        select(AssessmentAttempt).where(
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.learner_id == current_user.id,
        )
    )
    if existing is not None and existing.submitted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already completed this assessment.",
        )
    if existing is not None:
        return {
            "attempt_id": existing.id,
            "assessment": _assessment_response(db, assessment, include_correct=False),
        }

    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        learner_id=current_user.id,
        started_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return {
        "attempt_id": attempt.id,
        "assessment": _assessment_response(db, assessment, include_correct=False),
    }


@router.post("/{assessment_id}/submit")
def submit_attempt(
    assessment_id: str,
    payload: SubmitAttemptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Handle submit attempt for the current operation.

    Args:
        assessment_id: assessment_id value used by the operation.
        payload: Validated request body for the operation.
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    assessment = _get_assessment_or_404(db, assessment_id)
    _require_assigned_learner(assessment, current_user)

    attempt = db.scalar(
        select(AssessmentAttempt).where(
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.learner_id == current_user.id,
            AssessmentAttempt.submitted_at.is_(None),
        )
    )
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    now = datetime.now(timezone.utc)
    started_at = attempt.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    elapsed_minutes = (now - started_at).total_seconds() / 60
    grace_period_minutes = 2
    is_late = elapsed_minutes > assessment.duration_minutes + grace_period_minutes
    if is_late:
        logger.warning(
            "Attempt %s submitted %.1f minutes after its %d-minute limit",
            attempt.id,
            elapsed_minutes,
            assessment.duration_minutes,
        )

    questions = db.scalars(
        select(AssessmentQuestion).where(AssessmentQuestion.assessment_id == assessment_id)
    ).all()
    question_by_id = {question.id: question for question in questions}

    per_question = []
    correct_answers = 0
    selected_ids_map: dict[str, list[str]] = {}

    for question in questions:
        correct_option_ids = db.scalars(
            select(AssessmentOption.id)
            .where(AssessmentOption.question_id == question.id, AssessmentOption.is_correct.is_(True))
        ).all()
        selected_ids = payload.answers.get(question.id, [])
        selected_ids_map[question.id] = selected_ids
        is_correct = set(selected_ids) == set(correct_option_ids)
        if is_correct:
            correct_answers += 1
        per_question.append(
            PerQuestionResult(
                question_id=question.id,
                question_text=question.question_text,
                question_type=question.question_type,
                selected_option_ids=selected_ids,
                correct_option_ids=list(correct_option_ids),
                is_correct=is_correct,
                explanation=question.explanation,
            )
        )

    total_questions = len(questions)
    score = round((correct_answers / total_questions) * 100, 1) if total_questions else 0.0
    submitted_at = now

    attempt.submitted_at = submitted_at
    attempt.score_percentage = score
    attempt.total_questions = total_questions
    attempt.correct_answers = correct_answers
    attempt.is_late = is_late
    db.commit()

    for question in questions:
        db.add(
            AssessmentAttemptAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                selected_option_ids=",".join(payload.answers.get(question.id, [])),
            )
        )
    db.commit()

    return AttemptResultResponse(
        attempt_id=attempt.id,
        score_percentage=score,
        total_questions=total_questions,
        correct_answers=correct_answers,
        wrong_answers=total_questions - correct_answers,
        submitted_at=submitted_at,
        is_late=is_late,
        per_question=per_question,
    )


@router.get("/{assessment_id}/my-result")
def get_my_result(
    assessment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the my result for the current operation.

    Args:
        assessment_id: assessment_id value used by the operation.
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    assessment = _get_assessment_or_404(db, assessment_id)
    _require_assigned_learner(assessment, current_user)

    attempt = db.scalar(
        select(AssessmentAttempt)
        .where(
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.learner_id == current_user.id,
        )
        .order_by(AssessmentAttempt.started_at.desc())
    )
    if attempt is None or attempt.submitted_at is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")

    return _build_attempt_result(db, attempt)


@router.get("/{assessment_id}/results")
def get_admin_results(
    assessment_id: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Return the admin results for the current operation.

    Args:
        assessment_id: assessment_id value used by the operation.
        _: _ value used by the operation.
        db: Database session used for persistence and queries.
    """
    assessment = _get_assessment_or_404(db, assessment_id)
    attempts = db.scalars(
        select(AssessmentAttempt)
        .where(AssessmentAttempt.assessment_id == assessment_id)
        .order_by(AssessmentAttempt.submitted_at.desc())
    ).all()

    results = []
    for attempt in attempts:
        learner = db.get(User, attempt.learner_id)
        results.append(
            LearnerAttemptSummary(
                attempt_id=attempt.id,
                learner_id=attempt.learner_id,
                learner_name=learner.name if learner else "Unknown",
                learner_email=learner.email if learner else "",
                submitted_at=attempt.submitted_at,
                score_percentage=attempt.score_percentage,
                correct_answers=attempt.correct_answers,
                total_questions=attempt.total_questions,
                is_late=attempt.is_late,
            )
        )
    return results


@router.get("/attempts/{attempt_id}")
def get_attempt_detail(
    attempt_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the attempt detail for the current operation.

    Args:
        attempt_id: attempt_id value used by the operation.
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    learner = db.get(User, attempt.learner_id)
    if current_user.id != attempt.learner_id and current_user.role.lower() != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _build_attempt_result(db, attempt)


def _build_attempt_result(db: Session, attempt: AssessmentAttempt) -> AttemptResultResponse:
    """Build attempt result for the current operation.

    Args:
        db: Database session used for persistence and queries.
        attempt: attempt value used by the operation.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    assessment = db.get(Assessment, attempt.assessment_id)
    if assessment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    questions = db.scalars(
        select(AssessmentQuestion).where(AssessmentQuestion.assessment_id == assessment.id)
    ).all()
    answers = db.scalars(
        select(AssessmentAttemptAnswer).where(AssessmentAttemptAnswer.attempt_id == attempt.id)
    ).all()
    answer_map = {answer.question_id: answer for answer in answers}

    per_question = []
    for question in questions:
        correct_options = db.scalars(
            select(AssessmentOption.id)
            .where(AssessmentOption.question_id == question.id, AssessmentOption.is_correct.is_(True))
        ).all()
        selected = (
            answer_map.get(question.id).selected_option_ids.split(",")
            if answer_map.get(question.id) and answer_map.get(question.id).selected_option_ids
            else []
        )
        is_correct = set(selected) == set(correct_options)
        per_question.append(
            PerQuestionResult(
                question_id=question.id,
                question_text=question.question_text,
                question_type=question.question_type,
                selected_option_ids=selected,
                correct_option_ids=list(correct_options),
                is_correct=is_correct,
                explanation=question.explanation,
            )
        )

    if attempt.submitted_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt not submitted")

    return AttemptResultResponse(
        attempt_id=attempt.id,
        score_percentage=attempt.score_percentage or 0.0,
        total_questions=attempt.total_questions,
        correct_answers=attempt.correct_answers,
        wrong_answers=attempt.total_questions - attempt.correct_answers,
        submitted_at=attempt.submitted_at,
        is_late=attempt.is_late,
        per_question=per_question,
    )
