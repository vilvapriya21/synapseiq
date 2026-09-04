"""Pydantic schema for health-check responses."""

from pydantic import BaseModel


class HealthCheck(BaseModel):
    """Pydantic schema for HealthCheck payloads."""
    status: str
    service: str
