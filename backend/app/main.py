"""FastAPI application factory and startup checks."""

from fastapi import FastAPI

from app.api import api_router
from app.core.config import settings
from app.middleware.cors import configure_cors
from app import models


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Returns:
        Result produced by the operation.
    """
    app = FastAPI(title=settings.app_name)
    configure_cors(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.on_event("startup")
    def startup_check() -> None:
        # Models are imported to ensure they're registered.
        # Schema is managed by Alembic — run `alembic upgrade head` to migrate.
        """Log startup configuration details."""
        _ = models

    return app


app = create_app()
