from fastapi import APIRouter, Depends

from app.routers.auth import get_current_user

router = APIRouter()


@router.get("")
def get_dashboard(_: object = Depends(get_current_user)) -> dict:
    return {
        "stats": {
            "totalProjects": 12,
            "activeKtPlans": 4,
            "pendingAssessments": 8,
            "completedAssessments": 31,
        },
        "projects": [
            {
                "id": "payment-gateway",
                "name": "Payment Gateway Migration",
                "repository": "github.com/synapseiq/payments",
                "status": "Active",
                "ktProgress": 72,
                "assessmentScore": 84,
            },
            {
                "id": "auth-service",
                "name": "Auth Service Revamp",
                "repository": "github.com/synapseiq/auth-service",
                "status": "Active",
                "ktProgress": 45,
                "assessmentScore": 67,
            },
            {
                "id": "data-pipeline",
                "name": "Data Pipeline v3",
                "repository": "github.com/synapseiq/data-pipeline",
                "status": "Review",
                "ktProgress": 91,
                "assessmentScore": 92,
            },
            {
                "id": "notification-service",
                "name": "Notification Service",
                "repository": "github.com/synapseiq/notifications",
                "status": "Pending",
                "ktProgress": 20,
                "assessmentScore": 0,
            },
        ],
    }
