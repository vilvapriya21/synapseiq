from datetime import datetime, timedelta, timezone
from random import SystemRandom
import re

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_db
from app.models.user import PasswordResetCode, User
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    ResetPasswordRequest,
    SignupRequest,
    UserRead,
    VerifyResetRequest,
)
from app.services.email_service import send_password_reset_email

router = APIRouter()
bearer_scheme = HTTPBearer(auto_error=False)
random = SystemRandom()
PASSWORD_RULE_MESSAGE = (
    "Password must be 8-72 characters and include at least one uppercase letter, "
    "one lowercase letter, and one number."
)


def serialize_user(user: User) -> UserRead:
    return UserRead(id=user.id, email=user.email, name=user.name, roles=[user.role])


def find_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def validate_password(password: str) -> None:
    if not 8 <= len(password) <= 72:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=PASSWORD_RULE_MESSAGE)
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=PASSWORD_RULE_MESSAGE)
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=PASSWORD_RULE_MESSAGE)
    if not re.search(r"\d", password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=PASSWORD_RULE_MESSAGE)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication token")

    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token") from exc

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return user


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    if find_user(db, payload.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")
    if not payload.first_name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="First name is required")
    validate_password(payload.password)

    first_name = payload.first_name.strip()
    last_name = payload.last_name.strip() if payload.last_name else None
    name = f"{first_name}{' ' + last_name if last_name else ''}"

    role = (payload.role or "USER").upper()
    if role not in {"ADMIN", "USER"}:
        role = "USER"

    user = User(
        email=payload.email.lower(),
        name=name,
        first_name=first_name,
        last_name=last_name,
        role=role,
        hashed_password=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"message": "Account created. Please sign in."}


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = find_user(db, payload.email)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found. Please sign up first.")

    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(subject=user.id, claims={"email": user.email, "role": user.role})
    return LoginResponse(token=token, user=serialize_user(user))


@router.post("/logout")
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> dict[str, str]:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication token")
    try:
        jwt.decode(credentials.credentials, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token") from exc
    return {"message": "Logged out"}


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> UserRead:
    return serialize_user(current_user)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> ForgotPasswordResponse:
    user = find_user(db, payload.email)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found with this email.")

    code = f"{random.randrange(0, 1_000_000):06d}"
    reset_code = PasswordResetCode(user_id=user.id, verification_code=code, expires_at=datetime.now(timezone.utc) + timedelta(minutes=10))
    db.add(reset_code)
    db.commit()

    sent = send_password_reset_email(user.email, code)
    message = "Verification code sent to email." if sent else "Failed to send verification email."

    # in non-production expose code for development/debug convenience
    verification_code = code if settings.app_env != "production" else None
    return ForgotPasswordResponse(message=message, verification_code=verification_code)


@router.post("/verify-reset-code")
def verify_reset_code(payload: "VerifyResetRequest", db: Session = Depends(get_db)) -> dict[str, str]:
    from app.schemas.auth import VerifyResetRequest

    user = find_user(db, payload.email)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found with this email.")

    reset_code = db.scalar(
        select(PasswordResetCode)
        .where(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.verification_code == payload.code,
            PasswordResetCode.is_used.is_(False),
        )
        .order_by(PasswordResetCode.created_at.desc())
    )
    now = datetime.now(timezone.utc)
    if reset_code is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")
    if reset_code.expires_at.tzinfo is None:
        expires_at = reset_code.expires_at.replace(tzinfo=timezone.utc)
    else:
        expires_at = reset_code.expires_at
    if expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    return {"message": "Verification code is valid"}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passwords do not match")
    validate_password(payload.password)

    user = find_user(db, payload.email)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found with this email.")

    reset_code = db.scalar(
        select(PasswordResetCode)
        .where(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.verification_code == payload.code,
            PasswordResetCode.is_used.is_(False),
        )
        .order_by(PasswordResetCode.created_at.desc())
    )
    now = datetime.now(timezone.utc)
    if reset_code is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")
    if reset_code.expires_at.tzinfo is None:
        expires_at = reset_code.expires_at.replace(tzinfo=timezone.utc)
    else:
        expires_at = reset_code.expires_at
    if expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    # update password and mark verification code used and invalidate others
    user.hashed_password = get_password_hash(payload.password)
    reset_code.is_used = True
    # invalidate older verification codes
    db.execute(
        update(PasswordResetCode).where(PasswordResetCode.user_id == user.id, PasswordResetCode.id != reset_code.id).values(is_used=True)
    )
    db.commit()
    return {"message": "Password successfully updated. Please sign in."}
