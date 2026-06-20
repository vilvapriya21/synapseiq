"""merge assessment and contributor migration heads

Revision ID: d4e5f6a7b8c9
Revises: 9c8a7d6e5f4b, c1d2e3f4a5b6
Create Date: 2026-06-20
"""

from collections.abc import Sequence


revision: str = "d4e5f6a7b8c9"
down_revision: tuple[str, str] = ("9c8a7d6e5f4b", "c1d2e3f4a5b6")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
