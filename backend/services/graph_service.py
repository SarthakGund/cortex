from neo4j import GraphDatabase
from core.config import settings

class GraphService:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            settings.NEO4J_URI, 
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
        )

    def close(self):
        self.driver.close()

    def create_service_node(self, name: str, description: str, language: str):
        query = """
        MERGE (s:Service {name: $name})
        SET s.description = $description, s.language = $language, s.last_updated = datetime()
        RETURN s
        """
        with self.driver.session() as session:
            result = session.run(query, name=name, description=description, language=language)
            record = result.single(strict=False)
            return record[0] if record else None

    def create_endpoint_node(self, service_name: str, path: str):
        query = """
        MATCH (s:Service {name: $service_name})
        MERGE (e:Endpoint {path: $path})
        MERGE (s)-[r:EXPOSES]->(e)
        SET e.last_updated = datetime()
        RETURN e
        """
        with self.driver.session() as session:
            result = session.run(query, service_name=service_name, path=path)
            record = result.single(strict=False)
            return record[0] if record else None

    def create_dependency(self, source_service: str, target_service: str, protocol: str = "REST"):
        query = """
        MATCH (source:Service {name: $source_service})
        MATCH (target:Service {name: $target_service})
        MERGE (source)-[r:CALLS {protocol: $protocol}]->(target)
        SET r.last_verified = datetime()
        RETURN r
        """
        with self.driver.session() as session:
            result = session.run(query, source_service=source_service, target_service=target_service, protocol=protocol)
            record = result.single(strict=False)
            return record[0] if record else None

graph_service = GraphService()
