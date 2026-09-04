"""add_user_name

Revision ID: add_user_name
Revises: 352dafe584c7
Create Date: 2026-06-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_user_name'
down_revision = '352dafe584c7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('name', sa.String(length=255), nullable=True))
    op.execute(
        """
        UPDATE users
        SET name = COALESCE(first_name, '') ||
                   CASE WHEN first_name IS NOT NULL AND last_name IS NOT NULL AND last_name <> '' THEN ' ' ELSE '' END ||
                   COALESCE(last_name, '')
        """
    )
    op.alter_column('users', 'name', nullable=False)


def downgrade() -> None:
    op.drop_column('users', 'name')
