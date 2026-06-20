"""OAuth and token-management endpoints for Git provider integrations."""

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
    """Redirect an authenticated user to the GitHub OAuth authorization screen.

    The frontend supplies the JWT as a query parameter because browser redirects cannot
    send Authorization headers.

    Args:
        token: JWT access token for the user starting OAuth.
        db: Database session used to validate the user.

    Returns:
        Redirect response pointing to GitHub OAuth.

    Raises:
        HTTPException: If the token is invalid or the user cannot be found.
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
    """Handle github callback for the current operation.

    Args:
        code: code value used by the operation.
        state: state value used by the operation.
        db: Database session used for persistence and queries.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
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
    """Handle github status for the current operation.

    Args:
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    return {"connected": current_user.github_access_token is not None}


@router.delete("/auth/github", status_code=status.HTTP_204_NO_CONTENT)
def github_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Handle github disconnect for the current operation.

    Args:
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.
    """
    current_user.github_access_token = None
    db.commit()


@router.get("/auth/gitlab")
def gitlab_auth(token: str, db: Session = Depends(get_db)) -> RedirectResponse:
    """Handle gitlab auth for the current operation.

    Args:
        token: Provider access token used for authenticated operations.
        db: Database session used for persistence and queries.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
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

    redirect_uri = "http://localhost:8000/api/v1/auth/gitlab/callback"
    query_params = urlencode({
        "client_id": settings.gitlab_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "read_user read_repository read_api",
        "state": user.id,
    })
    return RedirectResponse(f"https://gitlab.com/oauth/authorize?{query_params}")


@router.get("/auth/gitlab/callback")
def gitlab_callback(code: str, state: str, db: Session = Depends(get_db)) -> RedirectResponse:
    """Handle gitlab callback for the current operation.

    Args:
        code: code value used by the operation.
        state: state value used by the operation.
        db: Database session used for persistence and queries.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    user = db.get(User, state)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")

    redirect_uri = "http://localhost:8000/api/v1/auth/gitlab/callback"
    response = httpx.post(
        "https://gitlab.com/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": settings.gitlab_client_id,
            "client_secret": settings.gitlab_client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        },
    )
    token_response = response.json()

    if "error" in token_response or not token_response.get("access_token"):
        detail = token_response.get("error_description") or token_response.get("error") or "GitLab OAuth failed"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    user.gitlab_access_token = token_response["access_token"]
    db.commit()
    return RedirectResponse("http://localhost:5173/repositories?gitlab=connected")


@router.get("/auth/gitlab/status")
def gitlab_status(current_user: User = Depends(get_current_user)) -> dict:
    """Handle gitlab status for the current operation.

    Args:
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    return {"connected": current_user.gitlab_access_token is not None}


@router.delete("/auth/gitlab", status_code=status.HTTP_204_NO_CONTENT)
def gitlab_disconnect(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    """Handle gitlab disconnect for the current operation.

    Args:
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.
    """
    current_user.gitlab_access_token = None
    db.commit()


@router.get("/auth/bitbucket")
def bitbucket_auth(token: str, db: Session = Depends(get_db)) -> RedirectResponse:
    """Handle bitbucket auth for the current operation.

    Args:
        token: Provider access token used for authenticated operations.
        db: Database session used for persistence and queries.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
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
        "client_id": settings.bitbucket_client_id,
        "response_type": "code",
        "state": user.id,
    })
    return RedirectResponse(f"https://bitbucket.org/site/oauth2/authorize?{query_params}")


@router.get("/auth/bitbucket/callback")
def bitbucket_callback(code: str, state: str, db: Session = Depends(get_db)) -> RedirectResponse:
    """Handle bitbucket callback for the current operation.

    Args:
        code: code value used by the operation.
        state: state value used by the operation.
        db: Database session used for persistence and queries.

    Returns:
        Result produced by the operation.

    Raises:
        HTTPException: If validation, authorization, or lookup fails.
    """
    user = db.get(User, state)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")

    response = httpx.post(
        "https://bitbucket.org/site/oauth2/access_token",
        auth=(settings.bitbucket_client_id, settings.bitbucket_client_secret),
        data={"grant_type": "authorization_code", "code": code},
    )
    token_response = response.json()

    if "error" in token_response or not token_response.get("access_token"):
        detail = token_response.get("error_description") or token_response.get("error") or "Bitbucket OAuth failed"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    user.bitbucket_access_token = token_response["access_token"]
    db.commit()
    return RedirectResponse("http://localhost:5173/repositories?bitbucket=connected")


@router.get("/auth/bitbucket/status")
def bitbucket_status(current_user: User = Depends(get_current_user)) -> dict:
    """Handle bitbucket status for the current operation.

    Args:
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    return {"connected": current_user.bitbucket_access_token is not None}


@router.delete("/auth/bitbucket", status_code=status.HTTP_204_NO_CONTENT)
def bitbucket_disconnect(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    """Handle bitbucket disconnect for the current operation.

    Args:
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.
    """
    current_user.bitbucket_access_token = None
    db.commit()


@router.post("/auth/azure/pat")
def azure_pat_connect(
    pat: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Store an Azure DevOps Personal Access Token for the current user.

    Args:
        pat: Azure DevOps Personal Access Token.
        current_user: Authenticated user associated with the request.
        db: Database session used to persist the token.

    Returns:
        Confirmation message after the PAT is saved.
    """
    current_user.azure_devops_token = pat
    db.commit()
    return {"message": "Azure DevOps PAT saved"}


@router.get("/auth/azure/status")
def azure_status(current_user: User = Depends(get_current_user)) -> dict:
    """Handle azure status for the current operation.

    Args:
        current_user: Authenticated user associated with the request.

    Returns:
        Result produced by the operation.
    """
    return {"connected": current_user.azure_devops_token is not None}


@router.delete("/auth/azure", status_code=status.HTTP_204_NO_CONTENT)
def azure_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Handle azure disconnect for the current operation.

    Args:
        current_user: Authenticated user associated with the request.
        db: Database session used for persistence and queries.
    """
    current_user.azure_devops_token = None
    db.commit()
