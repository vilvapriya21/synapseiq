"""Pydantic schemas for assessments, generated questions, attempts, and results."""

from datetime import datetime
from typing import Dict, List, Literal

from pydantic import BaseModel, Field


class GenerateQuestionsRequest(BaseModel):
    """Pydantic schema for GenerateQuestionsRequest payloads."""
    kt_topic_id: str
    num_questions: int = Field(ge=1, le=30)


class GeneratedOption(BaseModel):
    """Pydantic schema for GeneratedOption payloads."""
    label: str
    is_correct: bool


class GeneratedQuestion(BaseModel):
    """Pydantic schema for GeneratedQuestion payloads."""
    question_text: str
    question_type: Literal["single", "multi"]
    options: List[GeneratedOption]
    explanation: str
    difficulty: Literal["Easy", "Medium", "Hard"]


class GenerateQuestionsResponse(BaseModel):
    """Pydantic schema for GenerateQuestionsResponse payloads."""
    questions: List[GeneratedQuestion]


class SaveAssessmentRequest(BaseModel):
    """Pydantic schema for SaveAssessmentRequest payloads."""
    kt_topic_id: str
    title: str
    duration_minutes: int = Field(ge=1, le=180)
    questions: List[GeneratedQuestion]
    assigned_to: str | None = None


class AssignAssessmentRequest(BaseModel):
    """Pydantic schema for AssignAssessmentRequest payloads."""
    assigned_to: str


class AssessmentOptionResponse(BaseModel):
    """Pydantic schema for AssessmentOptionResponse payloads."""
    id: str
    label: str
    is_correct: bool
    order: int


class AssessmentQuestionResponse(BaseModel):
    """Pydantic schema for AssessmentQuestionResponse payloads."""
    id: str
    question_text: str
    question_type: str
    options: List[AssessmentOptionResponse]
    explanation: str | None
    difficulty: str
    order: int


class AssessmentResponse(BaseModel):
    """Pydantic schema for AssessmentResponse payloads."""
    id: str
    kt_topic_id: str
    title: str
    duration_minutes: int
    created_at: datetime
    assigned_to: str | None = None
    questions: List[AssessmentQuestionResponse]


class AssessmentListItem(BaseModel):
    """Pydantic schema for AssessmentListItem payloads."""
    id: str
    kt_topic_id: str
    repository_id: str
    title: str
    duration_minutes: int
    created_at: datetime
    assigned_to: str | None
    kt_topic_title: str
    repository_name: str
    has_submitted: bool


class OrphanedAssessmentReport(BaseModel):
    """Pydantic schema for orphaned assessment maintenance reports."""
    id: str
    kt_topic_id: str
    repository_id: str
    title: str
    created_at: datetime
    created_by: str
    assigned_to: str | None
    question_count: int
    kt_topic_title: str
    repository_name: str


class AssessmentOptionLearnerView(BaseModel):
    """Pydantic schema for AssessmentOptionLearnerView payloads."""
    id: str
    label: str
    order: int


class AssessmentQuestionLearnerView(BaseModel):
    """Pydantic schema for AssessmentQuestionLearnerView payloads."""
    id: str
    question_text: str
    question_type: str
    options: List[AssessmentOptionLearnerView]
    order: int


class AssessmentLearnerView(BaseModel):
    """Pydantic schema for AssessmentLearnerView payloads."""
    id: str
    kt_topic_id: str
    title: str
    duration_minutes: int
    questions: List[AssessmentQuestionLearnerView]


class SubmitAttemptRequest(BaseModel):
    """Pydantic schema for SubmitAttemptRequest payloads."""
    assessment_id: str
    answers: Dict[str, List[str]]


class PerQuestionResult(BaseModel):
    """Pydantic schema for PerQuestionResult payloads."""
    question_id: str
    question_text: str
    question_type: str
    selected_option_ids: List[str]
    selected_option_labels: List[str]
    correct_option_ids: List[str]
    correct_option_labels: List[str]
    is_correct: bool
    explanation: str | None


class AttemptResultResponse(BaseModel):
    """Pydantic schema for AttemptResultResponse payloads."""
    attempt_id: str
    score_percentage: float
    total_questions: int
    correct_answers: int
    wrong_answers: int
    submitted_at: datetime
    is_late: bool
    per_question: List[PerQuestionResult]


class LearnerAttemptSummary(BaseModel):
    """Pydantic schema for LearnerAttemptSummary payloads."""
    attempt_id: str
    learner_id: str
    learner_name: str
    learner_email: str
    submitted_at: datetime | None
    score_percentage: float | None
    correct_answers: int
    total_questions: int
    is_late: bool
