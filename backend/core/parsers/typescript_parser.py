import tree_sitter_typescript as tstypescript
import tree_sitter_javascript as tsjavascript
from tree_sitter import Language, Parser, Query, QueryCursor

class TypeScriptASTParser:
    def __init__(self):
        self.TS_LANGUAGE = Language(tstypescript.language_typescript())
        self.JS_LANGUAGE = Language(tsjavascript.language())
        self.ts_parser = Parser(self.TS_LANGUAGE)
        self.js_parser = Parser(self.JS_LANGUAGE)

    def _query(self, code: str, query_scm: str, language: str = "ts"):
        """Parse code with the right grammar and run a query. Returns captures dict."""
        lang_obj = self.JS_LANGUAGE if language == "js" else self.TS_LANGUAGE
        parser   = self.js_parser   if language == "js" else self.ts_parser
        tree = parser.parse(bytes(code, "utf8"))
        q = Query(lang_obj, query_scm)
        cursor = QueryCursor(q)
        return cursor.captures(tree.root_node), code

    # ------------------------------------------------------------------
    # API ENDPOINTS  (Express / NestJS style route calls)
    # Looks for:  app.get('/path', handler)  or  router.post('/path', handler)
    # Returns list of {"path": str, "method": str}
    # ------------------------------------------------------------------
    def extract_endpoints(self, code: str, language: str = "ts"):
        lang_obj = self.JS_LANGUAGE if language == "js" else self.TS_LANGUAGE
        parser   = self.js_parser   if language == "js" else self.ts_parser
        tree = parser.parse(bytes(code, "utf8"))

        q = Query(lang_obj, """
        (call_expression
          function: (member_expression
            property: (property_identifier) @method
          )
          arguments: (arguments (string) @route_path)
        )
        """)
        cursor = QueryCursor(q)

        http_methods = {"get", "post", "put", "delete", "patch", "head", "options"}
        endpoints = []

        # matches() pairs @method and @route_path per-match so indices are always in sync
        for _pattern_idx, match_captures in cursor.matches(tree.root_node):
            method_nodes = match_captures.get("method", [])
            path_nodes   = match_captures.get("route_path", [])
            if not method_nodes or not path_nodes:
                continue
            method_text = code[method_nodes[0].start_byte:method_nodes[0].end_byte].lower()
            path = code[path_nodes[0].start_byte:path_nodes[0].end_byte].strip("'\"` ")
            # Only keep proper route paths (must start with '/') and valid HTTP verbs
            if method_text in http_methods and path.startswith("/"):
                endpoints.append({"path": path, "method": method_text.upper()})
        return endpoints

    # ------------------------------------------------------------------
    # CLASSES
    # Looks for:  class Foo extends Bar { }
    # TypeScript uses (type_identifier) for class names; JavaScript uses (identifier)
    # Returns list of {"name": str, "bases": list[str]}
    # ------------------------------------------------------------------
    def extract_classes(self, code: str, language: str = "ts"):
        # tree-sitter-typescript grammar uses type_identifier for class names;
        # tree-sitter-javascript grammar uses plain identifier
        if language == "js":
            query_scm = "(class_declaration name: (identifier) @class_name)"
        else:
            query_scm = "(class_declaration name: (type_identifier) @class_name)"
        captures, _ = self._query(code, query_scm, language)
        classes = []
        for node in captures.get("class_name", []):
            name = code[node.start_byte:node.end_byte]
            # Detect 'extends' inline from surrounding text
            start = max(0, node.end_byte)
            surrounding = code[start:start + 60]
            bases = []
            if "extends" in surrounding:
                after_extends = surrounding.split("extends")[-1].split("{")[0].strip()
                base = after_extends.split()[0].strip(" ,{") if after_extends else ""
                if base:
                    bases.append(base)
            classes.append({"name": name, "bases": bases})
        return classes

    # ------------------------------------------------------------------
    # FUNCTIONS
    # Looks for:  function foo()  and  const foo = () =>  and  async function foo()
    # Returns list of {"name": str, "is_async": bool}
    # ------------------------------------------------------------------
    def extract_functions(self, code: str, language: str = "ts"):
        captures, _ = self._query(code, """
        [
          (function_declaration name: (identifier) @func_name)
          (lexical_declaration
            (variable_declarator
              name: (identifier) @func_name
              value: [(arrow_function) (function_expression)]
            )
          )
        ]
        """, language)
        functions = []
        for node in captures.get("func_name", []):
            name = code[node.start_byte:node.end_byte]
            start = max(0, node.start_byte - 20)
            surrounding = code[start:node.start_byte]
            is_async = "async" in surrounding
            line_number = code[:node.start_byte].count("\n") + 1
            functions.append({"name": name, "is_async": is_async, "line_number": line_number})
        return functions

    # ------------------------------------------------------------------
    # SCHEMAS  (TypeScript interfaces and type aliases)
    # Looks for:  interface Foo { }  and  type Foo = { }
    # Returns list of {"name": str, "type": str}
    # ------------------------------------------------------------------
    def extract_schemas(self, code: str, language: str = "ts"):
        if language == "js":
            return []  # JS has no interfaces/types

        captures, _ = self._query(code, """
        [
          (interface_declaration name: (type_identifier) @schema_name)
          (type_alias_declaration name: (type_identifier) @schema_name)
        ]
        """, language)
        schemas = []
        for node in captures.get("schema_name", []):
            name = code[node.start_byte:node.end_byte]
            schemas.append({"name": name, "type": "typescript_interface"})
        return schemas

    # ------------------------------------------------------------------
    # IMPORTS
    # Looks for:  import ... from 'module'
    # Returns list of module name strings
    # ------------------------------------------------------------------
    def extract_imports(self, code: str, language: str = "ts"):
        captures, _ = self._query(code, """
        (import_statement source: (string) @module)
        """, language)
        imports = []
        for node in captures.get("module", []):
            name = code[node.start_byte:node.end_byte].strip("'\"` ")
            imports.append(name)
        return list(set(imports))

typescript_parser = TypeScriptASTParser()
