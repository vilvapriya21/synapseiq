from fastapi import APIRouter

from app.api.v1 import health
from app.routers import admin, auth, dashboard, github_auth, repository

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(github_auth.router, tags=["github-auth"])
api_router.include_router(repository.router, prefix="/repositories", tags=["repositories"])
