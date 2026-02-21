from services.graph_service import graph_service
from core.parsers.python_parser import python_parser
from core.parsers.typescript_parser import typescript_parser
import os
import tempfile
import subprocess

class IngestionService:
    def __init__(self):
        pass

    def ingest_repository(self, repo_url: str):
        """
        1. Clone the repository
        2. Parse the AST (Abstract Syntax Tree)
        3. Extract services, endpoints, and database schemas
        4. Update the Living Knowledge Graph
        """
        print(f"Starting ingestion for {repo_url}")
        
        # Extract a clean service name from the URL
        service_name = repo_url.split("/")[-1].replace(".git", "")
        
        graph_service.create_service_node(
            name=service_name,
            description=f"Auto-ingested service from {repo_url}",
            language="Mixed"
        )
        
        # Create a temporary directory to clone the repo
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                print(f"Cloning {repo_url} into {temp_dir}")
                # Clone the repository
                subprocess.run(["git", "clone", repo_url, temp_dir], check=True, capture_output=True)
                
                # Walk through the directory and find files
                for root, _, files in os.walk(temp_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        
                        # Handle Python files
                        if file.endswith(".py"):
                            try:
                                with open(file_path, "r", encoding="utf-8") as f:
                                    code = f.read()
                                endpoints = python_parser.extract_endpoints(code)
                                for endpoint in endpoints:
                                    graph_service.create_endpoint_node(service_name, endpoint)
                                    print(f"Ingested Python endpoint: {endpoint} from {file}")
                            except Exception as e:
                                print(f"Error parsing Python file {file_path}: {e}")
                                
                        # Handle TypeScript/JavaScript files
                        elif file.endswith(".ts") or file.endswith(".js"):
                            try:
                                with open(file_path, "r", encoding="utf-8") as f:
                                    code = f.read()
                                # Pass "js" or "ts" so the parser picks the right grammar
                                lang_flag = "js" if file.endswith(".js") else "ts"
                                endpoints = typescript_parser.extract_endpoints(code, language=lang_flag)
                                for endpoint in endpoints:
                                    graph_service.create_endpoint_node(service_name, endpoint)
                                    print(f"Ingested TS/JS endpoint: {endpoint} from {file}")
                            except Exception as e:
                                print(f"Error parsing TS/JS file {file_path}: {e}")
                                
            except subprocess.CalledProcessError as e:
                print(f"Failed to clone repository: {e}")
                return {"status": "error", "message": f"Failed to clone repository: {e}"}
        
        return {"status": "success", "message": f"Ingested {service_name} into the Knowledge Graph"}

ingestion_service = IngestionService()
