"""Shared pagination parameter schema."""

from pydantic import BaseModel


class PageParams(BaseModel):
    """Pagination parameters shared by list endpoints."""
    page: int = 1
    page_size: int = 20
