from datetime import datetime, timezone
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
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
from app.models.repository_assignment import RepositoryAssignment
from app.models.user import User
from app.modules.llm_client import LLMProvider
from app.modules.question_generator import generate_assessment_questions
from app.routers.admin import require_admin
from app.routers.kt_topic import get_accessible_topic, is_learner
from app.routers.repository import get_owned_repository
from app.schemas.assessment import (
    AssessmentLearnerView,
    AssessmentOptionLearnerView,
    AssessmentOptionResponse,
    AssessmentQuestionLearnerView,
    AssessmentQuestionResponse,
    AssessmentResponse,
    AttemptResultResponse,
    GenerateQuestionsRequest,
    GenerateQuestionsResponse,
    GeneratedQuestion,
    LearnerAttemptSummary,
    PerQuestionResult,
    SaveAssessmentRequest,
    SubmitAttemptRequest,
)

router = APIRouter()


def _serialize_option(option: AssessmentOption) -> AssessmentOptionResponse:
    return AssessmentOptionResponse(
        id=option.id,
        label=option.label,
        is_correct=option.is_correct,
        order=option.order,
    )


def _serialize_question(question: AssessmentQuestion) -> AssessmentQuestionResponse:
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
    assessment = db.get(Assessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
    return assessment


@router.post("/generate-questions", response_model=GenerateQuestionsResponse)
def generate_questions(
    payload: GenerateQuestionsRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
    llm: LLMProvider = Depends(get_llm),
) -> GenerateQuestionsResponse:
    topic = db.get(KTTopic, payload.kt_topic_id)
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    get_owned_repository(db, topic.repository_id, current_user.id)
    generated = generate_assessment_questions(topic, payload.num_questions, db, llm)
    if not generated:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI generation failed — please retry",
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
    topic = db.get(KTTopic, payload.kt_topic_id)
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KT topic not found")

    get_owned_repository(db, topic.repository_id, current_user.id)

    if not payload.title.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")

    assessment = Assessment(
        kt_topic_id=payload.kt_topic_id,
        repository_id=topic.repository_id,
        title=payload.title.strip(),
        duration_minutes=payload.duration_minutes,
        created_by=current_user.id,
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    for index, question in enumerate(payload.questions):
        if not question.question_text.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Question text is required")
        if len(question.options) != 4 or any(not option.label.strip() for option in question.options):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each question requires exactly 4 non-empty options")
        if not any(option.is_correct for option in question.options):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each question requires at least one correct option")

        question_record = AssessmentQuestion(
            assessment_id=assessment.id,
            question_text=question.question_text.strip(),
            question_type=question.question_type,
            explanation=question.explanation.strip() if question.explanation else None,
            difficulty=question.difficulty,
            order=index,
        )
        db.add(question_record)
        db.commit()
        db.refresh(question_record)

        for option_index, option in enumerate(question.options):
            db.add(
                AssessmentOption(
                    question_id=question_record.id,
                    label=option.label.strip(),
                    is_correct=option.is_correct,
                    order=option_index,
                )
            )
    db.commit()
    return cast(AssessmentResponse, _assessment_response(db, assessment, include_correct=True))


@router.get("/by-topic/{kt_topic_id}")
def get_assessment_by_topic(
    kt_topic_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    topic = db.get(KTTopic, kt_topic_id)
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    if current_user.role.lower() == "admin":
        get_owned_repository(db, topic.repository_id, current_user.id)
        include_correct = True
    else:
        if not is_learner(current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        assignment = db.scalar(
            select(RepositoryAssignment).where(
                RepositoryAssignment.repository_id == topic.repository_id,
                RepositoryAssignment.kt_topic_id == kt_topic_id,
                RepositoryAssignment.learner_id == current_user.id,
            )
        )
        if assignment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
        include_correct = False

    assessment = db.scalar(select(Assessment).where(Assessment.kt_topic_id == kt_topic_id))
    if assessment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    return _assessment_response(db, assessment, include_correct=include_correct)


@router.post("/{assessment_id}/start")
def start_attempt(
    assessment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assessment = _get_assessment_or_404(db, assessment_id)
    topic = get_accessible_topic(db, assessment.repository_id, assessment.kt_topic_id, current_user)
    if not is_learner(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Learner access required")

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
    assessment = _get_assessment_or_404(db, assessment_id)
    if not is_learner(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Learner access required")

    attempt = db.scalar(
        select(AssessmentAttempt).where(
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.learner_id == current_user.id,
            AssessmentAttempt.submitted_at.is_(None),
        )
    )
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

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
    submitted_at = datetime.now(timezone.utc)

    attempt.submitted_at = submitted_at
    attempt.score_percentage = score
    attempt.total_questions = total_questions
    attempt.correct_answers = correct_answers
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
        per_question=per_question,
    )


@router.get("/{assessment_id}/my-result")
def get_my_result(
    assessment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assessment = _get_assessment_or_404(db, assessment_id)
    if not is_learner(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Learner access required")

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
            )
        )
    return results


@router.get("/attempts/{attempt_id}")
def get_attempt_detail(
    attempt_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    learner = db.get(User, attempt.learner_id)
    if current_user.id != attempt.learner_id and current_user.role.lower() != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _build_attempt_result(db, attempt)


def _build_attempt_result(db: Session, attempt: AssessmentAttempt) -> AttemptResultResponse:
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
        per_question=per_question,
    )
