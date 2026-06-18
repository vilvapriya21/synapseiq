from datetime import datetime
from typing import Dict, List, Literal

from pydantic import BaseModel, Field


class GenerateQuestionsRequest(BaseModel):
    kt_topic_id: str
    num_questions: int = Field(ge=1, le=30)


class GeneratedOption(BaseModel):
    label: str
    is_correct: bool


class GeneratedQuestion(BaseModel):
    question_text: str
    question_type: Literal["single", "multi"]
    options: List[GeneratedOption]
    explanation: str
    difficulty: Literal["Easy", "Medium", "Hard"]


class GenerateQuestionsResponse(BaseModel):
    questions: List[GeneratedQuestion]


class SaveAssessmentRequest(BaseModel):
    kt_topic_id: str
    title: str
    duration_minutes: int = Field(ge=1, le=180)
    questions: List[GeneratedQuestion]


class AssessmentOptionResponse(BaseModel):
    id: str
    label: str
    is_correct: bool
    order: int


class AssessmentQuestionResponse(BaseModel):
    id: str
    question_text: str
    question_type: str
    options: List[AssessmentOptionResponse]
    explanation: str | None
    difficulty: str
    order: int


class AssessmentResponse(BaseModel):
    id: str
    kt_topic_id: str
    title: str
    duration_minutes: int
    created_at: datetime
    questions: List[AssessmentQuestionResponse]


class AssessmentOptionLearnerView(BaseModel):
    id: str
    label: str
    order: int


class AssessmentQuestionLearnerView(BaseModel):
    id: str
    question_text: str
    question_type: str
    options: List[AssessmentOptionLearnerView]
    order: int


class AssessmentLearnerView(BaseModel):
    id: str
    kt_topic_id: str
    title: str
    duration_minutes: int
    questions: List[AssessmentQuestionLearnerView]


class SubmitAttemptRequest(BaseModel):
    assessment_id: str
    answers: Dict[str, List[str]]


class PerQuestionResult(BaseModel):
    question_id: str
    question_text: str
    question_type: str
    selected_option_ids: List[str]
    correct_option_ids: List[str]
    is_correct: bool
    explanation: str | None


class AttemptResultResponse(BaseModel):
    attempt_id: str
    score_percentage: float
    total_questions: int
    correct_answers: int
    wrong_answers: int
    submitted_at: datetime
    per_question: List[PerQuestionResult]


class LearnerAttemptSummary(BaseModel):
    attempt_id: str
    learner_id: str
    learner_name: str
    learner_email: str
    submitted_at: datetime | None
    score_percentage: float | None
    correct_answers: int
    total_questions: int
