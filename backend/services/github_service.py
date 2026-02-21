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
