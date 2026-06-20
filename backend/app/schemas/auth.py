"""Pydantic schemas for authentication and password reset payloads."""

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    """Pydantic schema for LoginRequest payloads."""
    email: EmailStr
    password: str


class SignupRequest(LoginRequest):
    """Pydantic schema for SignupRequest payloads."""
    first_name: str
    last_name: str | None = None
    role: str = "learner"


class Token(BaseModel):
    """Pydantic schema for Token payloads."""
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """Pydantic schema for TokenPayload payloads."""
    sub: str | None = None


class UserRead(BaseModel):
    """Pydantic schema for UserRead payloads."""
    id: str
    email: EmailStr
    name: str
    role: str
    roles: list[str] = []


class LoginResponse(BaseModel):
    """Pydantic schema for LoginResponse payloads."""
    token: str
    user: UserRead


class ForgotPasswordRequest(BaseModel):
    """Pydantic schema for ForgotPasswordRequest payloads."""
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    """Pydantic schema for ForgotPasswordResponse payloads."""
    message: str
    verification_code: str | None = None


class VerifyResetRequest(BaseModel):
    """Pydantic schema for VerifyResetRequest payloads."""
    email: EmailStr
    code: str


class ResetPasswordRequest(BaseModel):
    """Pydantic schema for ResetPasswordRequest payloads."""
    email: EmailStr
    code: str
    password: str
    confirm_password: str
