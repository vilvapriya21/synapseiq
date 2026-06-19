from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Contributor(Base):
    """
    A person who has committed to the repository, extracted from git log.
    Not necessarily a SynapseIQ user - just a name/email pulled from git history.
    Re-extracted each time 'Analyze Contributors' is run (old rows for this
    repository are cleared and replaced).
    """

    __tablename__ = "contributors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    repository_id: Mapped[str] = mapped_column(String(36), ForeignKey("repositories.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    commit_count: Mapped[int] = mapped_column(Integer, default=0)
    files_touched: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lines_added: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lines_deleted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prs_authored: Mapped[int | None] = mapped_column(Integer, nullable=True)
    top_files: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    extracted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
