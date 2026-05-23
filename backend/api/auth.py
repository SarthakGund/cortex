import urllib.parse
import logging

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
import requests

from core.config import settings
from core.database import SessionLocal
from core.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/github/login")
def github_login():
    if not settings.GITHUB_CLIENT_ID:
        return {"error": "GITHUB_CLIENT_ID is not configured"}

    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "scope": "repo admin:repo_hook",
    }
    url = f"https://github.com/login/oauth/authorize?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url)


@router.get("/github/callback")
def github_callback(code: str):
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        return {"error": "OAuth credentials not configured"}

    response = requests.post(
        "https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        data={
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code,
        },
    )
    data = response.json()
    access_token = data.get("access_token")

    frontend_url = settings.FRONTEND_URL

    if not access_token:
        error_msg = data.get("error_description", "auth_failed")
        logger.warning("GitHub OAuth callback failed: %s", error_msg)
        return RedirectResponse(f"{frontend_url}?error={urllib.parse.quote(error_msg)}")

    # Set the token in an httpOnly cookie — it never appears in the URL bar,
    # browser history, or server access logs.
    redirect = RedirectResponse(frontend_url)
    redirect.set_cookie(
        key="github_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,   # set True when running behind HTTPS in production
        max_age=60 * 60 * 24 * 30,  # 30 days
        path="/",
    )
    logger.info("OAuth login successful — token set as httpOnly cookie")
    return redirect


@router.get("/me")
def get_current_user(request: Request):
    """
    Return the authenticated user's public info (login, avatar).
    Reads the httpOnly github_token cookie set during OAuth callback.
    Also accepts Authorization: Bearer <token> for API clients / Swagger.
    """
    from services.user_repo_service import user_repo_service
    try:
        user = user_repo_service.require_user(request)
        return {
            "github_id": user.github_id,
            "login": user.login,
            "avatar_url": user.avatar_url,
        }
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Not authenticated")


@router.post("/logout")
def logout():
    """Clear the session cookie."""
    response = RedirectResponse(settings.FRONTEND_URL)
    response.delete_cookie(key="github_token", path="/")
    return response
