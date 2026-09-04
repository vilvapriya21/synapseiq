"""FastAPI dependency helpers for obtaining the configured LLM provider."""

from app.modules.llm_client import LLMProvider, get_llm_provider


def get_llm() -> LLMProvider:
    """Return the configured LLM provider dependency.

    Returns:
        Result produced by the operation.
    """
    return get_llm_provider()
