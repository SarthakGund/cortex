"""
git_push_service.py
====================
Handles GitHub authentication (PAT verification) and git commit+push
for the Repo Health Scanner.  Kept separate so health_service.py stays
unchanged.
"""
import json
import datetime
import subprocess
import urllib.parse
import urllib.request
import urllib.error
from typing import Dict, Any, Optional


class GitPushService:

    # ── Token verification ────────────────────────────────────────────

    def verify_github_token(self, token: str, username: str = "") -> Dict[str, Any]:
        """
        Call the GitHub REST API to verify a Personal Access Token.
        Returns {valid, login, name, avatar_url, scopes, has_repo_scope}.
        """
        req = urllib.request.Request(
            "https://api.github.com/user",
            headers={
                "Authorization": f"token {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Cortex-Health-Scanner/1.0",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = json.loads(resp.read().decode())
                scopes = resp.headers.get("X-OAuth-Scopes", "")
                return {
                    "valid": True,
                    "login": body.get("login", ""),
                    "name":  body.get("name", ""),
                    "avatar_url": body.get("avatar_url", ""),
                    "scopes": [s.strip() for s in scopes.split(",") if s.strip()],
                    "has_repo_scope": "repo" in scopes or "public_repo" in scopes,
                }
        except urllib.error.HTTPError as e:
            if e.code == 401:
                return {"valid": False, "error": "Invalid token — authentication failed (401)."}
            return {"valid": False, "error": f"GitHub API error {e.code}"}
        except Exception as ex:
            return {"valid": False, "error": str(ex)}

    # ── Commit & push ─────────────────────────────────────────────────

    def commit_and_push(
        self,
        clone_dir: str,
        message: str = "",
        github_token: str = "",
        github_username: str = "",
    ) -> Dict[str, Any]:
        """
        Stage all changes, commit, then push to origin.

        If *github_token* is supplied the remote URL is temporarily rewritten
        to embed credentials so the push can succeed over HTTPS without a local
        credential helper.  The original URL is always restored afterwards.
        """
        import os
        if not clone_dir or not os.path.isdir(clone_dir):
            return {"success": False, "stdout": "", "stderr": "Clone directory not found."}

        commit_msg = message or (
            f"chore: apply Cortex health fixes "
            f"[{datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC]"
        )

        # ── inject credentials into remote URL ────────────────────────
        original_remote: Optional[str] = None
        if github_token:
            try:
                result = subprocess.run(
                    ["git", "-C", clone_dir, "remote", "get-url", "origin"],
                    capture_output=True, text=True, timeout=10,
                )
                original_remote = result.stdout.strip()
                authed_url = self._inject_token(
                    original_remote, github_token, github_username
                )
                subprocess.run(
                    ["git", "-C", clone_dir, "remote", "set-url", "origin", authed_url],
                    capture_output=True, timeout=10,
                )
            except Exception:
                pass  # fall through; push may fail with auth error

        try:
            subprocess.run(
                ["git", "-C", clone_dir, "add", "-A"],
                capture_output=True, text=True, timeout=30,
            )
            commit = subprocess.run(
                ["git", "-C", clone_dir, "commit", "-m", commit_msg],
                capture_output=True, text=True, timeout=30,
            )
            if commit.returncode != 0 and "nothing to commit" in (
                commit.stdout + commit.stderr
            ):
                return {"success": True, "stdout": "Nothing to commit.", "stderr": ""}

            push = subprocess.run(
                ["git", "-C", clone_dir, "push"],
                capture_output=True, text=True, timeout=60,
            )
            return {
                "success": push.returncode == 0,
                "stdout": push.stdout.strip(),
                "stderr": push.stderr.strip(),
            }
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e)}
        finally:
            # Always restore the clean remote URL — never persist the token
            if original_remote:
                try:
                    subprocess.run(
                        ["git", "-C", clone_dir, "remote", "set-url", "origin",
                         original_remote],
                        capture_output=True, timeout=10,
                    )
                except Exception:
                    pass

    # ── Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _inject_token(remote_url: str, token: str, username: str) -> str:
        """
        Rewrite an HTTPS remote URL to embed a Personal Access Token.
          https://github.com/owner/repo.git
          → https://{username}:{token}@github.com/owner/repo.git
        SSH URLs are returned unchanged.
        """
        parsed = urllib.parse.urlparse(remote_url)
        if parsed.scheme not in ("https", "http"):
            return remote_url
        user = username or "x-token"
        netloc_clean = parsed.hostname or parsed.netloc
        if parsed.port:
            netloc_clean = f"{netloc_clean}:{parsed.port}"
        authed = parsed._replace(
            netloc=(
                f"{urllib.parse.quote(user, safe='')}"
                f":{urllib.parse.quote(token, safe='')}"
                f"@{netloc_clean}"
            )
        )
        return urllib.parse.urlunparse(authed)


# singleton
git_push_service = GitPushService()
