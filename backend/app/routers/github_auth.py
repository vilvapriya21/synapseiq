from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt as jose_jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


@router.get("/auth/github")
def github_auth(
    token: str,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """
    Redirects to GitHub OAuth. Receives JWT as a query param because
    browser redirects (window.location.href) cannot send Authorization headers.
    """
    try:
        payload = jose_jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    query_params = urlencode({
        "client_id": settings.github_client_id,
        "scope": "repo,read:user",
        "state": user.id,
    })
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


@router.get("/auth/github/status")
def github_status(current_user: User = Depends(get_current_user)) -> dict:
    return {"connected": current_user.github_access_token is not None}


@router.delete("/auth/github", status_code=status.HTTP_204_NO_CONTENT)
def github_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    current_user.github_access_token = None
    db.commit()


@router.post("/auth/azure/pat")
def azure_pat_connect(
    pat: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Store user's Azure DevOps Personal Access Token."""
    current_user.azure_devops_token = pat
    db.commit()
    return {"message": "Azure DevOps PAT saved"}


@router.get("/auth/azure/status")
def azure_status(current_user: User = Depends(get_current_user)) -> dict:
    return {"connected": current_user.azure_devops_token is not None}


@router.delete("/auth/azure", status_code=status.HTTP_204_NO_CONTENT)
def azure_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    current_user.azure_devops_token = None
    db.commit()
