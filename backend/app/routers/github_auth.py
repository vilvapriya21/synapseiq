from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


@router.get("/auth/github")
def github_auth(current_user: User = Depends(get_current_user)) -> RedirectResponse:
    query_params = urlencode(
        {
            "client_id": settings.github_client_id,
            "scope": "repo,read:user",
            "state": current_user.id,
        }
    )
    return RedirectResponse(f"https://github.com/login/oauth/authorize?{query_params}")


@router.get("/auth/github/callback")
def github_callback(code: str, state: str, db: Session = Depends(get_db)) -> RedirectResponse:
    user = db.get(User, state)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")

    response = httpx.post(
        "https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        json={
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret,
            "code": code,
        },
    )
    token_response = response.json()

    if "error" in token_response or not token_response.get("access_token"):
        detail = token_response.get("error_description") or token_response.get("error") or "GitHub OAuth failed"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    user.github_access_token = token_response["access_token"]
    db.commit()
    return RedirectResponse("http://localhost:5173/repositories?github=connected")
