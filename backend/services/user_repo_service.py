import httpx
from fastapi import HTTPException, Request
from typing import Optional

from core.database import SessionLocal
from core.models import User, UserRepo
from core.token_encryption import encrypt_token, decrypt_token


class UserRepoService:
    def _get_token(self, request: Request) -> str:
        # Prefer the httpOnly cookie set during OAuth callback
        cookie_token = request.cookies.get("github_token")
        if cookie_token:
            return cookie_token
        # Fall back to Authorization header (API clients, Swagger UI)
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            return auth.split(" ", 1)[1].strip()
        raise HTTPException(status_code=401, detail="Missing GitHub token")

    def _fetch_github_user(self, token: str) -> dict:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Authorization": f"Bearer {token}",
        }
        with httpx.Client(headers=headers, timeout=20) as client:
            resp = client.get("https://api.github.com/user")
            if resp.status_code == 401:
                raise HTTPException(status_code=401, detail="GitHub token unauthorized")
            resp.raise_for_status()
            return resp.json()

    def require_user(self, request: Request) -> User:
        token = self._get_token(request)
        gh_user = self._fetch_github_user(token)

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.github_id == gh_user["id"]).first()
            if user:
                # Re-encrypt if the plaintext token has changed since last login.
                if decrypt_token(user.token) != token:
                    user.token = encrypt_token(token)
                    db.commit()
                # Always expose the plaintext token to callers for this request.
                user.token = token
                return user

            user = User(
                github_id=gh_user["id"],
                login=gh_user.get("login", ""),
                avatar_url=gh_user.get("avatar_url"),
                token=encrypt_token(token),
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            # Expose plaintext for callers — the DB row holds the encrypted copy.
            user.token = token
            return user
        finally:
            db.close()

    def list_repos(self, user: User) -> list[dict]:
        db = SessionLocal()
        try:
            repos = (
                db.query(UserRepo)
                .filter(UserRepo.user_id == user.id)
                .order_by(UserRepo.created_at.desc())
                .all()
            )
            return [r.to_dict() for r in repos]
        finally:
            db.close()

    def add_repo(self, user: User, repo_url: str, token: str, branch: Optional[str]) -> dict:
        owner, repo = self._parse_repo_url(repo_url)
        repo_info = self._fetch_repo(owner, repo, token)

        repo_full_name = repo_info.get("full_name", f"{owner}/{repo}")
        default_branch = branch or repo_info.get("default_branch", "main")
        repo_key = f"{user.login}:{repo_full_name}"

        db = SessionLocal()
        try:
            existing = (
                db.query(UserRepo)
                .filter(UserRepo.user_id == user.id, UserRepo.repo_key == repo_key)
                .first()
            )
            if existing:
                existing.repo_url = repo_url
                existing.default_branch = default_branch
                db.commit()
                db.refresh(existing)
                return existing.to_dict()

            if db.query(UserRepo).filter(UserRepo.user_id == user.id, UserRepo.is_active == True).count() == 0:
                is_active = True
            else:
                is_active = False

            repo_row = UserRepo(
                user_id=user.id,
                repo_url=repo_url,
                repo_full_name=repo_full_name,
                default_branch=default_branch,
                repo_key=repo_key,
                is_active=is_active,
            )
            db.add(repo_row)
            db.commit()
            db.refresh(repo_row)
            return repo_row.to_dict()
        finally:
            db.close()

    def set_active_repo(self, user: User, repo_id: int) -> dict:
        db = SessionLocal()
        try:
            repo = (
                db.query(UserRepo)
                .filter(UserRepo.user_id == user.id, UserRepo.id == repo_id)
                .first()
            )
            if not repo:
                raise HTTPException(status_code=404, detail="Repo not found")

            db.query(UserRepo).filter(UserRepo.user_id == user.id).update({"is_active": False})
            repo.is_active = True
            db.commit()
            db.refresh(repo)
            return repo.to_dict()
        finally:
            db.close()

    def get_active_repo(self, user: User) -> UserRepo:
        db = SessionLocal()
        try:
            repo = (
                db.query(UserRepo)
                .filter(UserRepo.user_id == user.id, UserRepo.is_active == True)
                .first()
            )
            if not repo:
                raise HTTPException(status_code=400, detail="No active repo selected")
            return repo
        finally:
            db.close()

    def get_repo(self, user: User, repo_id: int) -> UserRepo:
        db = SessionLocal()
        try:
            repo = (
                db.query(UserRepo)
                .filter(UserRepo.user_id == user.id, UserRepo.id == repo_id)
                .first()
            )
            if not repo:
                raise HTTPException(status_code=404, detail="Repo not found")
            return repo
        finally:
            db.close()

    def remove_repo(self, user: User, repo_id: int) -> dict:
        db = SessionLocal()
        try:
            repo = (
                db.query(UserRepo)
                .filter(UserRepo.user_id == user.id, UserRepo.id == repo_id)
                .first()
            )
            if not repo:
                raise HTTPException(status_code=404, detail="Repo not found")
            was_active = repo.is_active
            db.delete(repo)
            db.commit()

            if was_active:
                next_repo = (
                    db.query(UserRepo)
                    .filter(UserRepo.user_id == user.id)
                    .order_by(UserRepo.created_at.desc())
                    .first()
                )
                if next_repo:
                    next_repo.is_active = True
                    db.commit()
                    db.refresh(next_repo)
                    return {"removed": repo_id, "active": next_repo.to_dict()}
            return {"removed": repo_id}
        finally:
            db.close()

    def _parse_repo_url(self, repo_url: str) -> tuple[str, str]:
        parts = repo_url.rstrip("/").replace(".git", "").split("/")
        if len(parts) < 2:
            raise HTTPException(status_code=400, detail="Invalid repo URL")
        return parts[-2], parts[-1]

    def _fetch_repo(self, owner: str, repo: str, token: str) -> dict:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Authorization": f"Bearer {token}",
        }
        with httpx.Client(headers=headers, timeout=20) as client:
            resp = client.get(f"https://api.github.com/repos/{owner}/{repo}")
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail="Repo not found or inaccessible")
            if resp.status_code == 401:
                raise HTTPException(status_code=401, detail="GitHub token unauthorized")
            resp.raise_for_status()
            return resp.json()


user_repo_service = UserRepoService()
