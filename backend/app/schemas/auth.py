from pydantic import BaseModel, EmailStr


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
