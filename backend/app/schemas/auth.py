from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SignupRequest(LoginRequest):
    first_name: str
    last_name: str | None = None
    role: str = "learner"


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str | None = None


class UserRead(BaseModel):
    id: str
    email: EmailStr
    name: str
    roles: list[str] = []


class LoginResponse(BaseModel):
    token: str
    user: UserRead


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    verification_code: str | None = None


class VerifyResetRequest(BaseModel):
    email: EmailStr
    code: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    password: str
    confirm_password: str
