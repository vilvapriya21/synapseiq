"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic import AnyHttpUrl, Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-backed application settings."""
    app_name: str = "SynapseIQ"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = Field(default="", description="PostgreSQL connection URL (NeonDB)")
    jwt_secret_key: str = Field(default="change-me", min_length=8)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    github_client_id: str = Field(default="")
    github_client_secret: str = Field(default="")
    gitlab_client_id: str = Field(default="")
    gitlab_client_secret: str = Field(default="")
    bitbucket_client_id: str = Field(default="")
    bitbucket_client_secret: str = Field(default="")
    llm_provider: str = Field(default="ollama")
    groq_api_key: str = Field(default="")
    groq_model: str = Field(default="llama-3.3-70b-versatile")
    ollama_base_url: str = Field(default="http://localhost:11434")
    ollama_model: str = Field(default="llama3.1")
    ollama_timeout_seconds: float = Field(default=300)
    backend_cors_origins: list[AnyHttpUrl] | list[str] = ["http://localhost:5173"]

    @field_validator("database_url")
    @classmethod
    def database_url_must_be_set(cls, v: str) -> str:
        """Handle database url must be set for the current operation.

        Args:
            v: v value used by the operation.

        Returns:
            Result produced by the operation.

        Raises:
            ValueError: If the operation cannot be completed.
        """
        if not v:
            raise ValueError(
                "DATABASE_URL is not set. Add it to backend/.env — "
                "get the connection string from your NeonDB dashboard."
            )
        return v

    @field_validator("groq_api_key")
    @classmethod
    def groq_api_key_required_for_groq(cls, v: str, info: ValidationInfo) -> str:
        """Handle groq api key required for groq for the current operation.

        Args:
            v: v value used by the operation.
            info: info value used by the operation.

        Returns:
            Result produced by the operation.

        Raises:
            ValueError: If the operation cannot be completed.
        """
        if info.data.get("llm_provider") == "groq" and not v:
            raise ValueError("LLM_PROVIDER is set to 'groq'. Set GROQ_API_KEY in backend/.env.")
        return v

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    """Return the settings for the current operation.

    Returns:
        Result produced by the operation.
    """
    return Settings()


settings = get_settings()
