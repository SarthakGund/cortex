import urllib.parse
from fastapi import APIRouter
from fastapi.responses import RedirectResponse
import requests
from core.config import settings

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.get("/github/login")
def github_login():
    if not settings.GITHUB_CLIENT_ID:
        return {"error": "GITHUB_CLIENT_ID is not configured in backend"}
        
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "scope": "repo admin:repo_hook",
    }
    qs = urllib.parse.urlencode(params)
    url = f"https://github.com/login/oauth/authorize?{qs}"
    return RedirectResponse(url)

@router.get("/github/callback")
def github_callback(code: str):
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        return {"error": "OAuth credentials missing"}

    response = requests.post(
        "https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        data={
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code
        }
    )
    data = response.json()
    access_token = data.get("access_token")

    # In a real app, you'd get the frontend URL from config
    # We will assume localhost:3000 for this demo
    frontend_url = "http://localhost:3000"
    
    if access_token:
        return RedirectResponse(f"{frontend_url}?token={access_token}")
    else:
        error_msg = data.get("error_description", "auth_failed")
        return RedirectResponse(f"{frontend_url}?error={urllib.parse.quote(error_msg)}")
