"""CORS middleware configuration for the FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings


def configure_cors(app: FastAPI) -> None:
    """Attach CORS middleware to the FastAPI application.

    Args:
        app: app value used by the operation.
    """
    configured_origins = [str(origin).rstrip("/") for origin in settings.backend_cors_origins]
    development_origin_regex = None
    if settings.app_env.lower() in {"development", "dev", "local"}:
        development_origin_regex = r"https?://(?:localhost|127\.0\.0\.1)(?::\d+)?"

    app.add_middleware(
        CORSMiddleware,
        allow_origins=configured_origins,
        allow_origin_regex=development_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
