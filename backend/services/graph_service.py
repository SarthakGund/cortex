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

    # =========================================================================
    # INFRASTRUCTURE LAYER — Service, Endpoint, Database, Table, MessageQueue
    # =========================================================================

    def create_service_node(self, name: str, description: str = "", language: str = "unknown"):
        """Root node. Represents a running unit (Docker container / microservice)."""
        return self._run("""
            MERGE (s:Service {name: $name})
            SET s.description  = $description,
                s.language     = $language,
                s.last_updated = datetime()
            RETURN s
        """, name=name, description=description, language=language)

    def create_endpoint_node(self, service_name: str, path: str, method: str = "UNKNOWN",
                              file_path: str = "", auth_requirement: str = "none",
                              request_schema: str = "", deprecated: bool = False):
        """
        Endpoint = the public API doorway (e.g. POST /v1/login).
        Metadata: auth_requirement, request_schema, deprecated.
        Edge:  Service -[EXPOSES]-> Endpoint
        """
        return self._run("""
            MATCH (s:Service {name: $service_name})
            MERGE (e:Endpoint {path: $path, service: $service_name, method: $method})
            SET e.file_path        = $file_path,
                e.auth_requirement = $auth_requirement,
                e.request_schema   = $request_schema,
                e.deprecated       = $deprecated,
                e.last_updated     = datetime()
            MERGE (s)-[:EXPOSES]->(e)
            RETURN e
        """, service_name=service_name, path=path, method=method, file_path=file_path,
             auth_requirement=auth_requirement, request_schema=request_schema, deprecated=deprecated)

    def create_database_node(self, service_name: str, db_name: str, db_type: str = "unknown"):
        """Database = where data lives.  Edge:  Service -[USES_DB]-> Database"""
        return self._run("""
            MATCH (s:Service {name: $service_name})
            MERGE (d:Database {name: $db_name})
            SET d.type = $db_type, d.last_updated = datetime()
            MERGE (s)-[:USES_DB]->(d)
            RETURN d
        """, service_name=service_name, db_name=db_name, db_type=db_type)

    def create_table_node(self, db_name: str, table_name: str):
        """
        Table = a specific table/collection inside a Database.
        Edge:  Database -[HAS_TABLE]-> Table
        This is the target for WRITES_TO / READS_FROM edges from Functions.
        """
        return self._run("""
            MERGE (d:Database {name: $db_name})
            MERGE (t:Table {name: $table_name, db: $db_name})
            MERGE (d)-[:HAS_TABLE]->(t)
            RETURN t
        """, db_name=db_name, table_name=table_name)

    def create_message_queue_node(self, service_name: str, topic_name: str, queue_type: str = "kafka"):
        """
        MessageQueue/Topic = async communication channel between services.
        Edge:  Service -[PUBLISHES_TO]-> MessageQueue
        """
        return self._run("""
            MATCH (s:Service {name: $service_name})
            MERGE (q:MessageQueue {name: $topic_name})
            SET q.type = $queue_type, q.last_updated = datetime()
            MERGE (s)-[:PUBLISHES_TO]->(q)
            RETURN q
        """, service_name=service_name, topic_name=topic_name, queue_type=queue_type)

    def create_service_dependency(self, source_service: str, target_service: str, protocol: str = "REST"):
        """
        Maps the microservice web.
        Edge:  Service A -[DEPENDS_ON {protocol}]-> Service B
        """
        return self._run("""
            MATCH (src:Service {name: $source_service})
            MERGE (tgt:Service {name: $target_service})
            MERGE (src)-[r:DEPENDS_ON {protocol: $protocol}]->(tgt)
            SET r.last_verified = datetime()
            RETURN r
        """, source_service=source_service, target_service=target_service, protocol=protocol)

    # =========================================================================
    # CODE LAYER — Module, File, Class, Function, Schema
    # =========================================================================

    def create_module_node(self, service_name: str, module_name: str):
        """Logical package/directory grouping.  Edge:  Service -[HAS_MODULE]-> Module"""
        return self._run("""
            MATCH (s:Service {name: $service_name})
            MERGE (m:Module {name: $module_name, service: $service_name})
            SET m.last_updated = datetime()
            MERGE (s)-[:HAS_MODULE]->(m)
            RETURN m
        """, service_name=service_name, module_name=module_name)

    def create_file_node(self, service_name: str, module_name: str, file_path: str, language: str,
                          last_commit_hash: str = "", last_modified_date: str = ""):
        """
        Physical source file in the repo.
        Metadata: last_commit_hash, last_modified_date.
        Edge:  Module -[CONTAINS]-> File
        """
        return self._run("""
            MATCH (m:Module {name: $module_name, service: $service_name})
            MERGE (f:File {path: $file_path})
            SET f.language           = $language,
                f.service            = $service_name,
                f.last_commit_hash   = $last_commit_hash,
                f.last_modified_date = $last_modified_date,
                f.last_updated       = datetime()
            MERGE (m)-[:CONTAINS]->(f)
            RETURN f
        """, service_name=service_name, module_name=module_name, file_path=file_path,
             language=language, last_commit_hash=last_commit_hash, last_modified_date=last_modified_date)

    def create_class_node(self, service_name: str, file_path: str, class_name: str,
                           base_classes: list = None, line_number: int = 0):
        """
        Class definition in a file.
        Metadata: line_number.
        Edges:  File -[DEFINES]-> Class,  Class -[EXTENDS]-> parent Class
        """
        if base_classes is None:
            base_classes = []
        self._run("""
            MATCH (f:File {path: $file_path})
            MERGE (c:Class {name: $class_name, service: $service_name})
            SET c.file_path    = $file_path,
                c.line_number  = $line_number,
                c.last_updated = datetime()
            MERGE (f)-[:DEFINES]->(c)
            RETURN c
        """, service_name=service_name, file_path=file_path,
             class_name=class_name, line_number=line_number)
        for base in base_classes:
            self._run("""
                MATCH (child:Class {name: $class_name, service: $service_name})
                MERGE (parent:Class {name: $base_name})
                MERGE (child)-[:EXTENDS]->(parent)
            """, service_name=service_name, class_name=class_name, base_name=base)

    def create_function_node(self, service_name: str, file_path: str, func_name: str,
                              class_name: str = None, is_async: bool = False,
                              line_number: int = 0, docstring: str = "",
                              complexity_score: int = 1):
        """
        Function or method definition.
        Metadata: line_number, docstring, complexity_score (McCabe-style branch count).
        Edges:
          Class -[HAS_METHOD]-> Function   (when class_name is set)
          File  -[DEFINES]->   Function   (top-level)
        """
        if class_name:
            return self._run("""
                MATCH (c:Class {name: $class_name, service: $service_name})
                MERGE (fn:Function {name: $func_name, file_path: $file_path, class: $class_name})
                SET fn.is_async         = $is_async,
                    fn.service          = $service_name,
                    fn.line_number      = $line_number,
                    fn.docstring        = $docstring,
                    fn.complexity_score = $complexity_score,
                    fn.last_updated     = datetime()
                MERGE (c)-[:HAS_METHOD]->(fn)
                RETURN fn
            """, service_name=service_name, file_path=file_path, func_name=func_name,
                 class_name=class_name, is_async=is_async, line_number=line_number,
                 docstring=docstring, complexity_score=complexity_score)
        else:
            return self._run("""
                MATCH (f:File {path: $file_path})
                MERGE (fn:Function {name: $func_name, file_path: $file_path})
                SET fn.is_async         = $is_async,
                    fn.service          = $service_name,
                    fn.line_number      = $line_number,
                    fn.docstring        = $docstring,
                    fn.complexity_score = $complexity_score,
                    fn.last_updated     = datetime()
                MERGE (f)-[:DEFINES]->(fn)
                RETURN fn
            """, service_name=service_name, file_path=file_path, func_name=func_name,
                 is_async=is_async, line_number=line_number, docstring=docstring,
                 complexity_score=complexity_score)

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
        """File -[IMPORTS]-> Module — inter-file / inter-service dependency."""
        return self._run("""
            MATCH (f:File {path: $source_file})
            MERGE (t:Module {name: $imported_module})
            MERGE (f)-[:IMPORTS]->(t)
        """, source_file=source_file, imported_module=imported_module)

    def create_function_call_edge(self, caller_name: str, caller_file: str, callee_name: str):
        """
        Traces logic flow between functions.
        Edge:  Function A -[CALLS]-> Function B
        Powers: "What-If" chain tracing — find all callers of a changed function.
        """
        return self._run("""
            MERGE (caller:Function {name: $caller_name, file_path: $caller_file})
            MERGE (callee:Function {name: $callee_name})
            MERGE (caller)-[:CALLS]->(callee)
        """, caller_name=caller_name, caller_file=caller_file, callee_name=callee_name)

    def create_db_write_edge(self, func_name: str, func_file: str, table_name: str):
        """
        Enables "What-If" DB column analysis.
        Edge:  Function -[WRITES_TO]-> Table
        """
        return self._run("""
            MERGE (fn:Function {name: $func_name, file_path: $func_file})
            MERGE (t:Table {name: $table_name})
            MERGE (fn)-[:WRITES_TO]->(t)
        """, func_name=func_name, func_file=func_file, table_name=table_name)

    def create_db_read_edge(self, func_name: str, func_file: str, table_name: str):
        """
        Enables "What-If" DB column analysis.
        Edge:  Function -[READS_FROM]-> Table
        """
        return self._run("""
            MERGE (fn:Function {name: $func_name, file_path: $func_file})
            MERGE (t:Table {name: $table_name})
            MERGE (fn)-[:READS_FROM]->(t)
        """, func_name=func_name, func_file=func_file, table_name=table_name)

    # =========================================================================
    # KNOWLEDGE LAYER — Developer, ADR, Incident, Documentation
    # =========================================================================

    def create_developer_node(self, username: str, email: str = "", team: str = ""):
        """Developer = who wrote or owns the code."""
        return self._run("""
            MERGE (d:Developer {username: $username})
            SET d.email = $email, d.team = $team, d.last_updated = datetime()
            RETURN d
        """, username=username, email=email, team=team)

    def create_ownership_edge(self, service_name: str, developer_username: str):
        """
        Know who to tag in a PR / on-call page.
        Edge:  Service -[OWNED_BY]-> Developer
        """
        return self._run("""
            MATCH (s:Service {name: $service_name})
            MERGE (d:Developer {username: $developer_username})
            MERGE (s)-[:OWNED_BY]->(d)
        """, service_name=service_name, developer_username=developer_username)

    def create_adr_node(self, service_name: str, title: str, status: str = "proposed",
                         context: str = "", decision: str = ""):
        """
        ADR = the WHY behind a design decision.
        Edge:  Service -[HAS_ADR]-> ADR
        """
        return self._run("""
            MATCH (s:Service {name: $service_name})
            MERGE (a:ADR {title: $title, service: $service_name})
            SET a.status       = $status,
                a.context      = $context,
                a.decision     = $decision,
                a.last_updated = datetime()
            MERGE (s)-[:HAS_ADR]->(a)
            RETURN a
        """, service_name=service_name, title=title, status=status,
             context=context, decision=decision)

    def create_implements_edge(self, class_name: str, service_name: str, adr_title: str):
        """
        Links code back to original design decisions.
        Edge:  Class -[IMPLEMENTS]-> ADR
        """
        return self._run("""
            MATCH (c:Class {name: $class_name, service: $service_name})
            MATCH (a:ADR   {title: $adr_title,  service: $service_name})
            MERGE (c)-[:IMPLEMENTS]->(a)
        """, class_name=class_name, service_name=service_name, adr_title=adr_title)

    def create_incident_node(self, service_name: str, title: str,
                              severity: str = "low", postmortem_url: str = ""):
        """
        Incident = a past outage / post-mortem linked to a service.
        Edge:   Service -[HAD_INCIDENT]-> Incident
        Powers: "Time Machine" incident replay.
        """
        return self._run("""
            MATCH (s:Service {name: $service_name})
            MERGE (i:Incident {title: $title, service: $service_name})
            SET i.severity       = $severity,
                i.postmortem_url = $postmortem_url,
                i.last_updated   = datetime()
            MERGE (s)-[:HAD_INCIDENT]->(i)
            RETURN i
        """, service_name=service_name, title=title,
             severity=severity, postmortem_url=postmortem_url)

    def create_documentation_node(self, service_name: str, title: str,
                                   url: str = "", doc_type: str = "readme"):
        """
        Documentation = README, wiki page, runbook.
        Edge:   Service -[HAS_DOC]-> Documentation
        Powers: Contextual Onboarding — surface most-relevant docs for a new dev.
        """
        return self._run("""
            MATCH (s:Service {name: $service_name})
            MERGE (doc:Documentation {title: $title, service: $service_name})
            SET doc.url          = $url,
                doc.type         = $doc_type,
                doc.last_updated = datetime()
            MERGE (s)-[:HAS_DOC]->(doc)
            RETURN doc
        """, service_name=service_name, title=title, url=url, doc_type=doc_type)


graph_service = GraphService()
