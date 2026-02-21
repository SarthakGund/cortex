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

    def _run(self, query: str, **params):
        """Internal helper to run a query and return the first record safely."""
        with self.driver.session() as session:
            result = session.run(query, **params)
            record = result.single(strict=False)
            return record[0] if record else None

    # -------------------------------------------------------------------------
    # INFRASTRUCTURE LAYER
    # -------------------------------------------------------------------------

    def create_service_node(self, name: str, description: str, language: str):
        """
        Service = a running unit (e.g. a Docker container / microservice).
        This is the root node. Everything else hangs off it.
        """
        return self._run(
            """
            MERGE (s:Service {name: $name})
            SET s.description = $description,
                s.language = $language,
                s.last_updated = datetime()
            RETURN s
            """,
            name=name, description=description, language=language
        )

    def create_endpoint_node(self, service_name: str, path: str, method: str = "UNKNOWN", file_path: str = ""):
        """
        Endpoint = the public API doorway of a service (e.g. POST /v1/login).
        Linked from:  Service -[EXPOSES]-> Endpoint
        """
        return self._run(
            """
            MATCH (s:Service {name: $service_name})
            MERGE (e:Endpoint {path: $path, service: $service_name})
            SET e.method = $method,
                e.file_path = $file_path,
                e.last_updated = datetime()
            MERGE (s)-[:EXPOSES]->(e)
            RETURN e
            """,
            service_name=service_name, path=path, method=method, file_path=file_path
        )

    def create_database_node(self, service_name: str, db_name: str, db_type: str = "unknown"):
        """
        Database = where data lives (e.g. PostgreSQL, MongoDB).
        Linked from:  Service -[USES_DB]-> Database
        """
        return self._run(
            """
            MATCH (s:Service {name: $service_name})
            MERGE (d:Database {name: $db_name})
            SET d.type = $db_type,
                d.last_updated = datetime()
            MERGE (s)-[:USES_DB]->(d)
            RETURN d
            """,
            service_name=service_name, db_name=db_name, db_type=db_type
        )

    def create_dependency(self, source_service: str, target_service: str, protocol: str = "REST"):
        """
        Creates a CALLS edge between two services.
        """
        return self._run(
            """
            MATCH (source:Service {name: $source_service})
            MATCH (target:Service {name: $target_service})
            MERGE (source)-[r:CALLS {protocol: $protocol}]->(target)
            SET r.last_verified = datetime()
            RETURN r
            """,
            source_service=source_service, target_service=target_service, protocol=protocol
        )

    # -------------------------------------------------------------------------
    # CODE LAYER
    # -------------------------------------------------------------------------

    def create_module_node(self, service_name: str, module_name: str):
        """
        Module = a logical package/directory grouping files (e.g. auth_service, routes).
        Linked from:  Service -[HAS_MODULE]-> Module
        """
        return self._run(
            """
            MATCH (s:Service {name: $service_name})
            MERGE (m:Module {name: $module_name, service: $service_name})
            SET m.last_updated = datetime()
            MERGE (s)-[:HAS_MODULE]->(m)
            RETURN m
            """,
            service_name=service_name, module_name=module_name
        )

    def create_file_node(self, service_name: str, module_name: str, file_path: str, language: str):
        """
        File = the physical source file in the repo.
        Linked from:  Module -[CONTAINS]-> File
        """
        return self._run(
            """
            MATCH (m:Module {name: $module_name, service: $service_name})
            MERGE (f:File {path: $file_path})
            SET f.language = $language,
                f.service = $service_name,
                f.last_updated = datetime()
            MERGE (m)-[:CONTAINS]->(f)
            RETURN f
            """,
            service_name=service_name, module_name=module_name,
            file_path=file_path, language=language
        )

    def create_class_node(self, service_name: str, file_path: str, class_name: str, base_classes: list = []):
        """
        Class = a class definition found in a file.
        Linked from:  File -[DEFINES]-> Class
        Also creates EXTENDS edges for each base class.
        """
        self._run(
            """
            MATCH (f:File {path: $file_path})
            MERGE (c:Class {name: $class_name, service: $service_name})
            SET c.file_path = $file_path,
                c.last_updated = datetime()
            MERGE (f)-[:DEFINES]->(c)
            RETURN c
            """,
            service_name=service_name, file_path=file_path, class_name=class_name
        )
        # Create EXTENDS edges for base classes
        for base in base_classes:
            self._run(
                """
                MATCH (child:Class {name: $class_name, service: $service_name})
                MERGE (parent:Class {name: $base_name})
                MERGE (child)-[:EXTENDS]->(parent)
                """,
                service_name=service_name, class_name=class_name, base_name=base
            )

    def create_function_node(self, service_name: str, file_path: str, func_name: str,
                              class_name: str = None, is_async: bool = False):
        """
        Function = a function or method definition.
        If class_name is given → File -[DEFINES]-> Class -[HAS_METHOD]-> Function
        Otherwise             → File -[DEFINES]-> Function
        """
        if class_name:
            return self._run(
                """
                MATCH (c:Class {name: $class_name, service: $service_name})
                MERGE (fn:Function {name: $func_name, file_path: $file_path, class: $class_name})
                SET fn.is_async = $is_async,
                    fn.service = $service_name,
                    fn.last_updated = datetime()
                MERGE (c)-[:HAS_METHOD]->(fn)
                RETURN fn
                """,
                service_name=service_name, file_path=file_path,
                func_name=func_name, class_name=class_name, is_async=is_async
            )
        else:
            return self._run(
                """
                MATCH (f:File {path: $file_path})
                MERGE (fn:Function {name: $func_name, file_path: $file_path})
                SET fn.is_async = $is_async,
                    fn.service = $service_name,
                    fn.last_updated = datetime()
                MERGE (f)-[:DEFINES]->(fn)
                RETURN fn
                """,
                service_name=service_name, file_path=file_path,
                func_name=func_name, is_async=is_async
            )

    def create_schema_node(self, service_name: str, file_path: str, schema_name: str, schema_type: str = "model"):
        """
        Schema = a data model/interface (e.g. Pydantic BaseModel, TypeScript interface, Protobuf).
        schema_type can be: 'pydantic', 'typescript_interface', 'typescript_type', 'dataclass'
        Linked from:  File -[DEFINES]-> Schema
        """
        return self._run(
            """
            MATCH (f:File {path: $file_path})
            MERGE (sc:Schema {name: $schema_name, service: $service_name})
            SET sc.type = $schema_type,
                sc.file_path = $file_path,
                sc.last_updated = datetime()
            MERGE (f)-[:DEFINES]->(sc)
            RETURN sc
            """,
            service_name=service_name, file_path=file_path,
            schema_name=schema_name, schema_type=schema_type
        )

    def create_import_edge(self, source_file: str, imported_module: str):
        """
        Creates an IMPORTS edge between two File nodes.
        This is how we detect inter-file and inter-service dependencies.
        File -[IMPORTS]-> File/Module
        """
        return self._run(
            """
            MATCH (f:File {path: $source_file})
            MERGE (t:Module {name: $imported_module})
            MERGE (f)-[:IMPORTS]->(t)
            """,
            source_file=source_file, imported_module=imported_module
        )

graph_service = GraphService()
