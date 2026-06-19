"""add contributor metrics

Revision ID: 9c8a7d6e5f4b
Revises: 6f9d56ef3c73
Create Date: 2026-06-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9c8a7d6e5f4b"
down_revision = "6f9d56ef3c73"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contributors", sa.Column("files_touched", sa.Integer(), nullable=True))
    op.add_column("contributors", sa.Column("lines_added", sa.Integer(), nullable=True))
    op.add_column("contributors", sa.Column("lines_deleted", sa.Integer(), nullable=True))
    op.add_column("contributors", sa.Column("prs_authored", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("contributors", "prs_authored")
    op.drop_column("contributors", "lines_deleted")
    op.drop_column("contributors", "lines_added")
    op.drop_column("contributors", "files_touched")
