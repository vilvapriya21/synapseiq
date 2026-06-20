"""SQLAlchemy model for repository and KT-topic learner assignments."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class RepositoryAssignment(Base):
    """
    Assigns a learner to a specific KT topic within a repository.
    This is the KT-driven assignment model: a learner is assigned because
    they need knowledge transfer on a particular topic, not the whole repo.
    """

    __tablename__ = "repository_assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    repository_id: Mapped[str] = mapped_column(String(36), ForeignKey("repositories.id"), nullable=False, index=True)
    kt_topic_id: Mapped[str] = mapped_column(String(36), ForeignKey("kt_topics.id"), nullable=False, index=True)
    learner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    assigned_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="assigned", nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (UniqueConstraint("kt_topic_id", "learner_id", name="uq_topic_learner"),)
