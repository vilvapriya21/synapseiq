"""normalize kt topic URL path patterns

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-20
"""

from collections.abc import Sequence
import re

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: str = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_URL_TREE_RE = re.compile(
    r"^https?://(?:github\.com|gitlab\.com|bitbucket\.org|dev\.azure\.com)/"
    r".+?/(?:tree|blob|src|browse)/[^/]+/(?P<path>.+)$"
)
_KNOWN_GIT_HOST_URL_RE = re.compile(
    r"^https?://(?:github\.com|gitlab\.com|bitbucket\.org|dev\.azure\.com)(?:/.*)?$"
)


def _normalize_path_pattern(pattern: str) -> str:
    raw_pattern = pattern.strip()
    if not raw_pattern:
        return ""

    url_match = _URL_TREE_RE.match(raw_pattern)
    if url_match:
        raw_pattern = url_match.group("path").split("?", 1)[0].split("#", 1)[0]
    elif _KNOWN_GIT_HOST_URL_RE.match(raw_pattern):
        return ""

    return raw_pattern.replace("\\", "/").strip("/")


def _normalize_path_patterns(path_patterns: str | None) -> str | None:
    if not path_patterns:
        return None

    patterns = [
        normalized
        for pattern in path_patterns.split(",")
        if pattern.strip()
        for normalized in [_normalize_path_pattern(pattern)]
        if normalized
    ]
    if not patterns:
        return None
    return ", ".join(patterns)


def upgrade() -> None:
    kt_topics = sa.table(
        "kt_topics",
        sa.column("id", sa.String()),
        sa.column("path_patterns", sa.String()),
    )
    bind = op.get_bind()
    rows = bind.execute(
        sa.select(kt_topics.c.id, kt_topics.c.path_patterns).where(
            sa.or_(
                kt_topics.c.path_patterns.like("http://%"),
                kt_topics.c.path_patterns.like("https://%"),
            )
        )
    ).all()

    for topic_id, path_patterns in rows:
        bind.execute(
            kt_topics.update()
            .where(kt_topics.c.id == topic_id)
            .values(path_patterns=_normalize_path_patterns(path_patterns))
        )


def downgrade() -> None:
    pass
