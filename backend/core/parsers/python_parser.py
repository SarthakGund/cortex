import tree_sitter_python as tspython
from tree_sitter import Language, Parser, Query, QueryCursor

class PythonASTParser:
    def __init__(self):
        self.PY_LANGUAGE = Language(tspython.language())
        self.parser = Parser(self.PY_LANGUAGE)

    def _query(self, code: str, query_scm: str):
        """Parse code and run a query. Returns captures dict."""
        tree = self.parser.parse(bytes(code, "utf8"))
        q = Query(self.PY_LANGUAGE, query_scm)
        cursor = QueryCursor(q)
        return cursor.captures(tree.root_node), code

    # ------------------------------------------------------------------
    # API ENDPOINTS  (Flask / FastAPI style decorators)
    # Looks for:  @app.route('/path')  or  @router.get('/path')
    # Returns list of {"path": str, "method": str}
    # ------------------------------------------------------------------
    def extract_endpoints(self, code: str):
        captures, _ = self._query(code, """
        (decorator
          (call
            function: (attribute attribute: (identifier) @method_name)
            arguments: (argument_list (string) @route_path)
          )
        )
        """)
        endpoints = []
        paths  = [n for n in captures.get("route_path", [])]
        methods = [n for n in captures.get("method_name", [])]
        for i, node in enumerate(paths):
            path = code[node.start_byte:node.end_byte].strip("'\"")
            method = code[methods[i].start_byte:methods[i].end_byte].upper() if i < len(methods) else "UNKNOWN"
            endpoints.append({"path": path, "method": method})
        return endpoints

    # ------------------------------------------------------------------
    # CLASSES
    # Looks for:  class Foo(Bar):
    # Returns list of {"name": str, "bases": list[str]}
    # ------------------------------------------------------------------
    def extract_classes(self, code: str):
        captures, _ = self._query(code, """
        (class_definition
          name: (identifier) @class_name
          superclasses: (argument_list (identifier) @base_class)?
        )
        """)
        class_nodes = captures.get("class_name", [])
        base_nodes  = captures.get("base_class", [])

        # Group bases per class by proximity in the source
        classes = []

        # Simple approach: each class_name captures one node
        for node in class_nodes:
            name = code[node.start_byte:node.end_byte]
            # Find base classes that follow this class node (before the next class)
            next_class_byte = None
            for other in class_nodes:
                if other.start_byte > node.start_byte:
                    next_class_byte = other.start_byte
                    break
            bases = [
                code[b.start_byte:b.end_byte]
                for b in base_nodes
                if b.start_byte > node.start_byte and
                   (next_class_byte is None or b.start_byte < next_class_byte)
            ]
            classes.append({"name": name, "bases": bases})
        return classes

    # ------------------------------------------------------------------
    # FUNCTIONS
    # Looks for:  def foo(...):  and  async def foo(...):
    # Returns list of {"name", "is_async", "line_number", "docstring", "complexity_score"}
    # ------------------------------------------------------------------
    def extract_functions(self, code: str):
        captures, _ = self._query(code, """
        (function_definition
          name: (identifier) @func_name
        )
        """)
        lines = code.splitlines()
        functions = []
        for node in captures.get("func_name", []):
            name = code[node.start_byte:node.end_byte]
            start = max(0, node.start_byte - 20)
            surrounding = code[start:node.start_byte]
            is_async = "async" in surrounding
            line_number = code[:node.start_byte].count("\n") + 1

            # Extract docstring: look for a string literal right after the def line
            docstring = ""
            try:
                # find the colon ending the def line, then grab the first string
                rest = code[node.end_byte:]
                colon_idx = rest.find(":")
                if colon_idx != -1:
                    body = rest[colon_idx + 1:colon_idx + 300].lstrip()
                    if body.startswith('"""') or body.startswith("'''"):
                        quote = body[:3]
                        end = body.find(quote, 3)
                        if end != -1:
                            docstring = body[3:end].strip()
            except Exception:
                pass

            # Complexity score = count branch keywords in the function body (McCabe-style)
            try:
                func_line = line_number - 1
                # grab up to 100 lines of body
                body_lines = lines[func_line:func_line + 100]
                body_text  = "\n".join(body_lines)
                complexity = 1 + sum(
                    body_text.count(kw)
                    for kw in (" if ", " elif ", " for ", " while ", " except ",
                               " and ", " or ", " with ")
                )
            except Exception:
                complexity = 1

            functions.append({
                "name": name,
                "is_async": is_async,
                "line_number": line_number,
                "docstring": docstring,
                "complexity_score": complexity,
            })
        return functions
    # PYDANTIC SCHEMAS
    # Looks for: class SomeName(BaseModel):
    # Returns list of schema names
    # ------------------------------------------------------------------
    def extract_schemas(self, code: str):
        classes = self.extract_classes(code)
        schemas = []
        pydantic_bases = {"BaseModel", "SQLModel", "Schema", "Serializer", "TypedDict"}
        for cls in classes:
            for base in cls["bases"]:
                if base in pydantic_bases:
                    schemas.append({"name": cls["name"], "type": "pydantic"})
                    break
        return schemas

    # ------------------------------------------------------------------
    # IMPORTS
    # Looks for:  import foo  /  from foo import bar
    # Returns list of module name strings
    # ------------------------------------------------------------------
    def extract_imports(self, code: str):
        captures, _ = self._query(code, """
        [
          (import_statement (dotted_name) @module)
          (import_from_statement module_name: (dotted_name) @module)
        ]
        """)
        imports = []
        for node in captures.get("module", []):
            name = code[node.start_byte:node.end_byte]
            imports.append(name)
        return list(set(imports))  # deduplicate

    # ------------------------------------------------------------------
    # FUNCTION CALL EDGES  (who calls whom inside this file)
    # Returns list of {"caller": str, "callee": str}
    # ------------------------------------------------------------------
    def extract_function_calls(self, code: str):
        """
        Finds all direct function calls in the file.
        Used to build Function -[CALLS]-> Function edges.
        """
        captures, _ = self._query(code, """
        (call
          function: (identifier) @callee
        )
        """)
        # We don't have caller context here, so return just callees.
        # The ingestion layer pairs them with their enclosing function.
        callees = set()
        for node in captures.get("callee", []):
            callees.add(code[node.start_byte:node.end_byte])
        return list(callees)

    # ------------------------------------------------------------------
    # DB OPERATIONS  (detect ORM / raw SQL calls)
    # Returns list of {"operation": "write"|"read", "hint": str}
    # ------------------------------------------------------------------
    def extract_db_operations(self, code: str):
        """
        Heuristically detects DB write / read operations.
        Used to build Function -[WRITES_TO / READS_FROM]-> Table edges.
        Looks for ORM-style method calls: .save(), .create(), .filter(), etc.
        """
        write_hints = {"save", "create", "insert", "update", "delete",
                       "bulk_create", "execute", "commit", "insert_one",
                       "update_one", "delete_one", "replace_one"}
        read_hints  = {"filter", "get", "all", "find", "find_one", "select",
                       "query", "fetch", "fetchall", "fetchone", "aggregate"}
        captures, _ = self._query(code, """
        (call
          function: (attribute attribute: (identifier) @method)
        )
        """)
        ops = []
        for node in captures.get("method", []):
            name = code[node.start_byte:node.end_byte].lower()
            if name in write_hints:
                ops.append({"operation": "write", "hint": name})
            elif name in read_hints:
                ops.append({"operation": "read", "hint": name})
        return ops


python_parser = PythonASTParser()