"""Versioned health-check endpoints for service monitoring."""

from fastapi import APIRouter

from app.schemas.health import HealthCheck

router = APIRouter()


@router.get("", response_model=HealthCheck)
def health_check() -> HealthCheck:
    """Return the service health status.

    Returns:
        Result produced by the operation.
    """
    return HealthCheck(status="ok", service="SynapseIQ")
