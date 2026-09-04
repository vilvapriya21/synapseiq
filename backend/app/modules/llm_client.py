"""Thin wrappers around configured LLM providers for chat and analysis completions."""

import time
from typing import Protocol

import httpx

from app.core.config import settings


class LLMError(Exception):
    """Raised when the configured LLM provider cannot complete a request."""


class LLMProvider(Protocol):
    """Protocol for LLM providers that can complete prompt pairs."""
    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
        """Return an LLM completion for the supplied system and user prompts.

        Args:
            system_prompt: system_prompt value used by the operation.
            user_prompt: user_prompt value used by the operation.
            max_tokens: max_tokens value used by the operation.

        Returns:
            Result produced by the operation.
        """
        ...


class GroqProvider:
    """Groq-backed LLM provider implementation."""
    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
        """Return an LLM completion for the supplied system and user prompts.

        Args:
            system_prompt: system_prompt value used by the operation.
            user_prompt: user_prompt value used by the operation.
            max_tokens: max_tokens value used by the operation.

        Returns:
            Result produced by the operation.

        Raises:
            LLMError: If the configured provider cannot complete the request.
        """
        payload = {
            "model": settings.groq_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
        }
        headers = {"Authorization": f"Bearer {settings.groq_api_key}"}

        response: httpx.Response | None = None
        compacted_for_size = False
        retryable_statuses = {429, 500, 502, 503, 504}
        for attempt in range(3):
            try:
                response = httpx.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=httpx.Timeout(45, connect=10),
                )
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt < 2:
                    time.sleep(0.5 * (2 ** attempt))
                    continue
                raise LLMError("Groq is temporarily unreachable. Please try again shortly.") from exc
            except httpx.HTTPError as exc:
                raise LLMError(f"Groq request failed: {exc.__class__.__name__}") from exc

            if response.status_code == 200:
                break
            if response.status_code == 413 and not compacted_for_size and attempt < 2:
                # Preserve the grounding rules and the beginning of context, where
                # exact filename matches are placed, while dropping older history.
                payload["messages"][0]["content"] = system_prompt[:5_500] + "\n...(context compacted)"
                payload["messages"][1]["content"] = user_prompt[-1_200:]
                payload["max_tokens"] = min(max_tokens, 512)
                compacted_for_size = True
                continue
            if response.status_code in retryable_statuses and attempt < 2:
                retry_after = response.headers.get("retry-after")
                try:
                    delay = min(float(retry_after), 3.0) if retry_after else 0.5 * (2 ** attempt)
                except ValueError:
                    delay = 0.5 * (2 ** attempt)
                time.sleep(delay)
                continue
            break

        if response is None:
            raise LLMError("Groq did not return a response.")
        if response.status_code in {401, 403}:
            raise LLMError("Groq authentication failed. Check GROQ_API_KEY.")
        if response.status_code == 429:
            raise LLMError("Groq rate limit reached. Please try again shortly.")
        if response.status_code == 413:
            raise LLMError("The request is still too large for Groq after automatic compaction. Start a new chat and try again.")
        if response.status_code != 200:
            raise LLMError(f"Groq is unavailable (status {response.status_code}). Please try again shortly.")

        try:
            return response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("Groq returned an unexpected response shape.") from exc


class OllamaProvider:
    """Ollama-backed local LLM provider implementation."""
    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
        """Return an LLM completion for the supplied system and user prompts.

        Args:
            system_prompt: system_prompt value used by the operation.
            user_prompt: user_prompt value used by the operation.
            max_tokens: max_tokens value used by the operation.

        Returns:
            Result produced by the operation.

        Raises:
            LLMError: If the configured provider cannot complete the request.
        """
        url = f"{settings.ollama_base_url}/api/chat"
        payload = {
            "model": settings.ollama_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "options": {"num_predict": max_tokens},
        }

        try:
            timeout = httpx.Timeout(min(settings.ollama_timeout_seconds, 25), connect=10)
            response = httpx.post(url, json=payload, timeout=timeout)
        except httpx.ConnectError as exc:
            raise LLMError(f"Could not reach Ollama at {url}. Is it running?") from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"Ollama request failed: {exc.__class__.__name__}") from exc

        if response.status_code != 200:
            raise LLMError(f"Ollama request failed with status {response.status_code}.")

        try:
            return response.json()["message"]["content"]
        except (KeyError, TypeError) as exc:
            raise LLMError("Ollama returned an unexpected response shape.") from exc


def get_llm_provider() -> LLMProvider:
    """Return the configured LLM provider implementation.

    Returns:
        Result produced by the operation.

    Raises:
        LLMError: If the configured provider cannot complete the request.
    """
    if settings.llm_provider == "groq":
        return GroqProvider()
    if settings.llm_provider == "ollama":
        return OllamaProvider()
    raise LLMError(f"Unknown LLM_PROVIDER '{settings.llm_provider}'. Use 'groq' or 'ollama'.")
