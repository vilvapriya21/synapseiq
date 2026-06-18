from typing import Protocol

import httpx

from app.core.config import settings


class LLMError(Exception):
    """Raised when the configured LLM provider cannot complete a request."""


class LLMProvider(Protocol):
    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
        ...


class GroqProvider:
    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
        payload = {
            "model": settings.groq_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
        }
        headers = {"Authorization": f"Bearer {settings.groq_api_key}"}

        try:
            response = httpx.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=60,
            )
        except httpx.HTTPError as exc:
            raise LLMError(f"Groq request failed: {exc.__class__.__name__}") from exc

        if response.status_code != 200:
            raise LLMError(f"Groq request failed with status {response.status_code}.")

        try:
            return response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("Groq returned an unexpected response shape.") from exc


class OllamaProvider:
    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
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
            response = httpx.post(url, json=payload, timeout=120)
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
    if settings.llm_provider == "groq":
        return GroqProvider()
    if settings.llm_provider == "ollama":
        return OllamaProvider()
    raise LLMError(f"Unknown LLM_PROVIDER '{settings.llm_provider}'. Use 'groq' or 'ollama'.")
