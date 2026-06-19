"""add assessment assigned_to

Revision ID: c1d2e3f4a5b6
Revises: b9f5b0a1a2c3
Create Date: 2026-06-18 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "b9f5b0a1a2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("assessments", sa.Column("assigned_to", sa.String(36), nullable=True))
    op.create_index("ix_assessments_assigned_to", "assessments", ["assigned_to"], unique=False)
    op.create_foreign_key(None, "assessments", "users", ["assigned_to"], ["id"])


def downgrade() -> None:
    op.drop_index("ix_assessments_assigned_to", table_name="assessments")
    op.drop_column("assessments", "assigned_to")
