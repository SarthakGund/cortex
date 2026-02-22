import base64
import httpx
from typing import Optional


SKIP_EXTENSIONS = {
    ".json", ".lock", ".yml", ".yaml", ".md", ".txt",
    ".png", ".jpg", ".gif", ".svg", ".ico", ".woff", ".woff2",
    ".map", ".css", ".scss", ".html", ".xml", ".toml", ".ini",
    ".pyc", ".pyo", ".egg-info",
}

CODE_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


class GitHubService:
    def __init__(self, token: Optional[str] = None):
        self.base_url = "https://api.github.com"
        self.headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if token:
            self.headers["Authorization"] = f"Bearer {token}"

    # ─────────────────────── helpers ───────────────────────────────────────

    def _parse_url(self, repo_url: str) -> tuple[str, str]:
        """Extract (owner, repo) from any GitHub URL."""
        parts = repo_url.rstrip("/").replace(".git", "").split("/")
        return parts[-2], parts[-1]

    # ─────────────────────── public API ────────────────────────────────────

    def get_tree(self, repo_url: str, branch: str = "main") -> list[dict]:
        """
        Return the entire recursive file tree from GitHub as a flat list.
        Each item: { path, type ('blob'|'tree'), size }
        """
        owner, repo = self._parse_url(repo_url)
        with httpx.Client(headers=self.headers, timeout=20) as client:
            # Resolve branch → tree SHA
            r = client.get(f"{self.base_url}/repos/{owner}/{repo}/branches/{branch}")
            r.raise_for_status()
            tree_sha = r.json()["commit"]["commit"]["tree"]["sha"]

            # Fetch full recursive tree
            r2 = client.get(
                f"{self.base_url}/repos/{owner}/{repo}/git/trees/{tree_sha}",
                params={"recursive": "1"},
            )
            r2.raise_for_status()
            return r2.json().get("tree", [])

    def get_file_content(self, repo_url: str, file_path: str, branch: str = "main") -> str:
        """Fetch and decode the raw content of a single file."""
        owner, repo = self._parse_url(repo_url)
        with httpx.Client(headers=self.headers, timeout=20) as client:
            r = client.get(
                f"{self.base_url}/repos/{owner}/{repo}/contents/{file_path}",
                params={"ref": branch},
            )
            r.raise_for_status()
            data = r.json()
            if data.get("encoding") == "base64":
                return base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
            return data.get("content", "")

    def build_nested_tree(self, flat_items: list[dict]) -> list[dict]:
        """
        Convert the flat GitHub tree list into a nested folder/file structure
        suitable for rendering in the frontend.
        """
        nodes: dict[str, dict] = {}
        root: list[dict] = []

        for item in flat_items:
            path = item["path"]
            node = {
                "name": path.split("/")[-1],
                "path": path,
                "type": "folder" if item["type"] == "tree" else "file",
                "size": item.get("size"),
                "children": [] if item["type"] == "tree" else None,
            }
            nodes[path] = node

        for item in flat_items:
            path = item["path"]
            parts = path.split("/")
            if len(parts) == 1:
                root.append(nodes[path])
            else:
                parent_path = "/".join(parts[:-1])
                parent = nodes.get(parent_path)
                if parent and parent["children"] is not None:
                    parent["children"].append(nodes[path])

        return root

    def iter_code_files(self, repo_url: str, branch: str = "main"):
        """
        Generator that yields (file_path, extension, raw_code) for every
        code file in the repo, fetched directly from the GitHub API — no clone needed.
        """
        flat = self.get_tree(repo_url, branch)
        for item in flat:
            if item["type"] != "blob":
                continue
            path: str = item["path"]
            # Skip non-code and vendor paths
            if any(seg in path.split("/") for seg in ("node_modules", "__pycache__", ".git", "dist", "build")):
                continue
            ext = "." + path.rsplit(".", 1)[-1].lower() if "." in path else ""
            if ext not in CODE_EXTENSIONS:
                continue
            try:
                code = self.get_file_content(repo_url, path, branch)
                yield path, ext, code
            except Exception as exc:
                print(f"  [WARN] Could not fetch {path}: {exc}")


github_service = GitHubService()

import requests
from core.config import settings

class GitHubService:
    def __init__(self):
        self.token = settings.GITHUB_TOKEN
        self.base_webhook_url = settings.WEBHOOK_URL

    def create_webhook(self, repo_url: str, github_token: str = None) -> dict:
        """
        Automatically creates a GitHub webhook for the given repository
        if a token and WEBHOOK_URL are provided.
        """
        hook_url = self.base_webhook_url
        token_to_use = github_token or self.token

        if not token_to_use or not hook_url:
            print("[GitHubService] ⚠️ Skipping webhook creation: GitHub token or WEBHOOK_URL not set.")
            return {"status": "skipped", "message": "Configuration missing"}

        # Extract owner and repo from URL
        # e.g., https://github.com/owner/repo or https://github.com/owner/repo.git
        parts = repo_url.rstrip("/").replace(".git", "").split("/")
        if len(parts) < 2:
            return {"status": "error", "message": "Invalid repo URL"}
        
        owner, repo = parts[-2], parts[-1]
        api_url = f"https://api.github.com/repos/{owner}/{repo}/hooks"
        
        headers = {
            "Authorization": f"token {token_to_use}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        # Check if webhook already exists
        try:
            get_resp = requests.get(api_url, headers=headers)
            if get_resp.ok:
                existing_hooks = get_resp.json()
                for hook in existing_hooks:
                    if hook["config"].get("url") == self.base_webhook_url:
                        print(f"[GitHubService] ✅ Webhook already exists for {owner}/{repo}")
                        return {"status": "exists", "message": "Webhook already exists"}
        except Exception as e:
            print(f"[GitHubService] ⚠️ Error checking existing hooks: {e}")

        # Create new webhook
        hook_data = {
            "name": "web",
            "active": True,
            "events": ["push"],
            "config": {
                "url": self.base_webhook_url,
                "content_type": "json",
                "insecure_ssl": "0"
            }
        }
        
        try:
            resp = requests.post(api_url, headers=headers, json=hook_data)
            if resp.status_code == 201:
                print(f"[GitHubService] 🚀 Successfully created webhook for {owner}/{repo}")
                return {"status": "success", "message": "Webhook created"}
            else:
                error_msg = resp.json().get("message", "Unknown error")
                print(f"[GitHubService] ❌ Failed to create webhook: {error_msg}")
                return {"status": "error", "message": error_msg}
        except Exception as e:
            print(f"[GitHubService] ❌ Error creating webhook: {e}")
            return {"status": "error", "message": str(e)}

github_service = GitHubService()
