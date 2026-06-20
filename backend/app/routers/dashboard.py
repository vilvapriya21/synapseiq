"""API endpoint for dashboard summary metrics."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.repository import Repository
from app.models.user import User
from app.routers.auth import get_current_user

router = APIRouter()


@router.get("")
def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    # Real counts from the repositories table for this user
    """Return the dashboard for the current operation.

    Args:
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.

    Returns:
        Result produced by the operation.
    """
    all_repos = db.scalars(
        select(Repository)
        .where(Repository.owner_id == current_user.id)
        .order_by(Repository.created_at.desc())
    ).all()

    total = len(all_repos)
    indexed = sum(1 for r in all_repos if r.status == "indexed")
    pending = sum(1 for r in all_repos if r.status in ("pending", "indexing"))
    error = sum(1 for r in all_repos if r.status == "error")
    kb_ready = sum(1 for r in all_repos if getattr(r, "knowledge_base_status", "none") == "ready")

    # Build projects list from real repositories
    projects = [
        {
            "id": repo.id,
            "name": repo.name,
            "repository": repo.url or f"upload/{repo.name}",
            "provider": getattr(repo, "provider", "github"),
            "status": repo.status,
            "language": repo.language or "Unknown",
            "module_count": repo.module_count,
            "file_count": getattr(repo, "file_count", 0),
            "knowledge_base_status": getattr(repo, "knowledge_base_status", "none"),
            "branch": repo.branch or "main",
            "created_at": repo.created_at.isoformat(),
        }
        for repo in all_repos
    ]

    return {
        "stats": {
            "totalRepositories": total,
            "indexedRepositories": indexed,
            "pendingRepositories": pending,
            "knowledgeBasesReady": kb_ready,
        },
        "projects": projects,
    }
