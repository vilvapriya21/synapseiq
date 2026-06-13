from fastapi import FastAPI

from app.api import api_router
from app.core.config import settings
from app.db.database import Base
from app.db.session import engine
from app.middleware.cors import configure_cors
from app import models


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    configure_cors(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.on_event("startup")
    def create_database_tables() -> None:
        _ = models
        Base.metadata.create_all(bind=engine)

    return app


app = create_app()
