from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# NeonDB (and PostgreSQL generally) requires connection pooling config.
# NullPool is used for serverless/edge environments where connections
# must not be held open between requests.
# For a long-running server like uvicorn, use the default pool but
# with pre-ping to detect stale connections.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,       # test connection before use (handles Neon sleep)
    pool_size=5,              # max persistent connections
    max_overflow=10,          # extra connections under load
    pool_timeout=30,          # wait up to 30s for a connection
    pool_recycle=300,         # recycle connections every 5 minutes
    connect_args={
        "sslmode": "require",  # Neon requires SSL
        "connect_timeout": 10,
    } if "neon.tech" in settings.database_url else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
