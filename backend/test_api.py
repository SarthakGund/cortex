#!/usr/bin/env python3
"""Simple test to verify the API returns commits from the database."""

import requests
import json

API_URL = "http://localhost:8000"

def test_commits_endpoint():
    """Test the /webhook/commits endpoint."""
    print("=" * 60)
    print("Testing /webhook/commits endpoint")
    print("=" * 60)
    
    try:
        response = requests.get(f"{API_URL}/webhook/commits")
        print(f"\nStatus Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Received {len(data)} commits\n")
            
            if data:
                print("First commit:")
                print(json.dumps(data[0], indent=2))
            else:
                print("⚠️  No commits in database")
        else:
            print(f"❌ Error: {response.text}")
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to API. Is the server running?")
        print("   Start it with: uv run uvicorn main:app --reload")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_commits_endpoint()
