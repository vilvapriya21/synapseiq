"""add_assessment_models
 
Revision ID: b9f5b0a1a2c3
Revises: 6f9d56ef3c73
Create Date: 2026-06-18 00:00:00.000000
 
"""
from typing import Sequence, Union
 
from alembic import op
import sqlalchemy as sa
 
 
# revision identifiers, used by alembic.
revision: str = "b9f5b0a1a2c3"
down_revision: Union[str, None] = "6f9d56ef3c73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None
 
 
def upgrade() -> None:
    op.create_table(
        "assessments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("kt_topic_id", sa.String(length=36), nullable=False),
        sa.Column("repository_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assessments_kt_topic_id"), "assessments", ["kt_topic_id"], unique=False)
    op.create_index(op.f("ix_assessments_repository_id"), "assessments", ["repository_id"], unique=False)
    op.create_foreign_key(None, "assessments", "kt_topics", ["kt_topic_id"], ["id"])
    op.create_foreign_key(None, "assessments", "repositories", ["repository_id"], ["id"])
    op.create_foreign_key(None, "assessments", "users", ["created_by"], ["id"])
 
    op.create_table(
        "assessment_questions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("assessment_id", sa.String(length=36), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("question_type", sa.String(length=20), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("difficulty", sa.String(length=20), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assessment_questions_assessment_id"), "assessment_questions", ["assessment_id"], unique=False)
    op.create_foreign_key(None, "assessment_questions", "assessments", ["assessment_id"], ["id"])
 
    op.create_table(
        "assessment_options",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("question_id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assessment_options_question_id"), "assessment_options", ["question_id"], unique=False)
    op.create_foreign_key(None, "assessment_options", "assessment_questions", ["question_id"], ["id"])
 
    op.create_table(
        "assessment_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("assessment_id", sa.String(length=36), nullable=False),
        sa.Column("learner_id", sa.String(length=36), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("score_percentage", sa.Float(), nullable=True),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("correct_answers", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assessment_attempts_assessment_id"), "assessment_attempts", ["assessment_id"], unique=False)
    op.create_index(op.f("ix_assessment_attempts_learner_id"), "assessment_attempts", ["learner_id"], unique=False)
    op.create_foreign_key(None, "assessment_attempts", "assessments", ["assessment_id"], ["id"])
    op.create_foreign_key(None, "assessment_attempts", "users", ["learner_id"], ["id"])
 
    op.create_table(
        "assessment_attempt_answers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("attempt_id", sa.String(length=36), nullable=False),
        sa.Column("question_id", sa.String(length=36), nullable=False),
        sa.Column("selected_option_ids", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assessment_attempt_answers_attempt_id"), "assessment_attempt_answers", ["attempt_id"], unique=False)
    op.create_index(op.f("ix_assessment_attempt_answers_question_id"), "assessment_attempt_answers", ["question_id"], unique=False)
    op.create_foreign_key(None, "assessment_attempt_answers", "assessment_attempts", ["attempt_id"], ["id"])
    op.create_foreign_key(None, "assessment_attempt_answers", "assessment_questions", ["question_id"], ["id"])
 
 
def downgrade() -> None:
    op.drop_table("assessment_attempt_answers")
    op.drop_table("assessment_attempts")
    op.drop_table("assessment_options")
    op.drop_table("assessment_questions")
    op.drop_table("assessments")
 
 