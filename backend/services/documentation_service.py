import os
from datetime import datetime
from services.graph_service import graph_service
from services.llm_service import llm_service
from core.config import settings

class DocumentationService:
    def __init__(self):
        self.template_path = os.path.join(os.path.dirname(__file__), "..", "core", "templates", "api_documentation.md")
        self.output_dir = os.path.join(os.path.dirname(__file__), "..", "..", "docs")
        
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

    def _get_system_data(self):
        """Fetches structured data from Neo4j to populate documentation."""
        services_data = []
        
        # 1. Fetch all Services
        with graph_service.driver.session() as session:
            service_nodes = session.run("MATCH (s:Service) RETURN s.name as name, s.description as description, s.language as language")
            for svc in service_nodes:
                svc_name = svc["name"]
                
                # 2. Fetch Endpoints for this Service
                endpoints = session.run(
                    "MATCH (s:Service {name: $name})-[:EXPOSES]->(e:Endpoint) "
                    "RETURN e.method as method, e.path as path, e.file_path as file_path", 
                    name=svc_name
                )
                svc_endpoints = [{"method": e["method"], "path": e["path"], "file_path": e["file_path"]} for e in endpoints]
                
                # 3. Fetch Schemas for this Service (via Files)
                schemas = session.run(
                    "MATCH (s:Service {name: $name})-[:HAS_MODULE]->()-[:CONTAINS]->()-[:DEFINES]->(sc:Schema) "
                    "RETURN sc.name as name, sc.type as type, sc.file_path as file_path",
                    name=svc_name
                )
                svc_schemas = [{"name": s["name"], "type": s["type"], "file_path": s["file_path"]} for s in schemas]
                
                services_data.append({
                    "name": svc_name,
                    "description": svc["description"],
                    "language": svc["language"],
                    "endpoints": svc_endpoints,
                    "schemas": svc_schemas
                })
        
        # 4. Fetch Relationships between Services
        relationships = []
        with graph_service.driver.session() as session:
            rel_nodes = session.run(
                "MATCH (s1:Service)-[r:CALLS]->(s2:Service) "
                "RETURN s1.name as src, s2.name as dst, r.protocol as protocol"
            )
            for r in rel_nodes:
                relationships.append(f"- Service `{r['src']}` calls `{r['dst']}` via {r['protocol']}")
                
        return {
            "services": services_data,
            "relationships": "\n".join(relationships) if relationships else "No inter-service relationships detected."
        }

    def generate_documentation(self) -> str:
        """Main method to generate and save documentation."""
        print("[Docs] Generating system documentation...")
        data = self._get_system_data()
        
        # Build System Overview using LLM
        system_summary_prompt = f"""
        Based on the following system components, provide a high-level architectural overview for this project.
        Components: {json_dumps_safe(data['services'])}
        Relationships: {data['relationships']}
        
        Keep it professional, concise, and technical.
        """
        
        system_overview = "Automated overview generation failed."
        if llm_service.enabled:
            try:
                response = llm_service.model.generate_content(system_summary_prompt)
                system_overview = response.text.strip()
            except Exception as e:
                print(f"[Docs] LLM Error: {e}")

        # Load Template
        with open(self.template_path, "r") as f:
            template = f.read()

        # Simple string replacement for major sections (simplified logic for the sake of the demo)
        doc = template.replace("{{generated_at}}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        doc = doc.replace("{{system_overview}}", system_overview)
        doc = doc.replace("{{relationships}}", data["relationships"])
        
        # Generate the services section
        services_markdown = ""
        for svc in data["services"]:
            svc_md = f"### Service: {svc['name']}\n"
            svc_md += f"- **Description:** {svc['description']}\n"
            svc_md += f"- **Language:** {svc['language']}\n\n"
            
            svc_md += "#### Endpoints\n"
            svc_md += "| Method | Path | File |\n"
            svc_md += "|--------|------|------|\n"
            for ep in svc["endpoints"]:
                svc_md += f"| {ep['method']} | {ep['path']} | {ep['file_path']} |\n"
            
            svc_md += "\n#### Models & Schemas\n"
            for sc in svc["schemas"]:
                svc_md += f"- **{sc['name']}** (Type: {sc['type']}) - Defined in `{sc['file_path']}`\n"
            
            svc_md += "\n---\n"
            services_markdown += svc_md

        # This is a bit of a hacky replacement logic for the loop in the template
        # In a real app, you'd use Jinja2. Here we'll just reconstruct the content.
        
        # Construct final doc manually for better reliability without Jinja2 dependency
        final_doc = f"""# System Architecture Documentation
Generated on: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Overview
{system_overview}

## Services
{services_markdown}

## Component Relationships
{data['relationships']}
"""

        output_path = os.path.join(self.output_dir, "SYSTEM_DOCS.md")
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(final_doc)
            
        print(f"[Docs] Documentation updated at {output_path}")
        return output_path

def json_dumps_safe(data):
    import json
    return json.dumps(data, indent=2)

documentation_service = DocumentationService()
