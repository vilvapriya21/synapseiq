from fastapi import APIRouter

from app.schemas.health import HealthCheck

router = APIRouter()


@router.get("", response_model=HealthCheck)
def health_check() -> HealthCheck:
    return HealthCheck(status="ok", service="SynapseIQ")
