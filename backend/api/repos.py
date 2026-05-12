from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from typing import Optional

from services.user_repo_service import user_repo_service

router = APIRouter(prefix="/repos", tags=["Repos"])


class AddRepoRequest(BaseModel):
    repo_url: str = Field(..., min_length=3)
    branch: Optional[str] = None


class SelectRepoRequest(BaseModel):
    repo_id: int


@router.get("")
def list_repos(request: Request):
    user = user_repo_service.require_user(request)
    repos = user_repo_service.list_repos(user)
    return {"repos": repos}


@router.post("")
def add_repo(request: Request, body: AddRepoRequest):
    user = user_repo_service.require_user(request)
    token = user_repo_service._get_token(request)
    repo = user_repo_service.add_repo(user, body.repo_url, token, body.branch)
    return {"repo": repo}


@router.post("/select")
def select_repo(request: Request, body: SelectRepoRequest):
    user = user_repo_service.require_user(request)
    repo = user_repo_service.set_active_repo(user, body.repo_id)
    return {"active": repo}


@router.get("/active")
def active_repo(request: Request):
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    return {"active": repo.to_dict()}


@router.delete("/{repo_id}")
def remove_repo(request: Request, repo_id: int):
    user = user_repo_service.require_user(request)
    result = user_repo_service.remove_repo(user, repo_id)
    return result
