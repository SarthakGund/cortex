import tree_sitter_typescript as tstypescript
import tree_sitter_javascript as tsjavascript
from tree_sitter import Language, Parser, Query, QueryCursor

class TypeScriptASTParser:
    def __init__(self):
        # Load both TypeScript and JavaScript grammars
        self.TS_LANGUAGE = Language(tstypescript.language_typescript())
        self.JS_LANGUAGE = Language(tsjavascript.language())
        self.ts_parser = Parser(self.TS_LANGUAGE)
        self.js_parser = Parser(self.JS_LANGUAGE)
        # Keep self.parser as alias for compatibility
        self.parser = self.ts_parser

    def parse_code(self, code: str, language: str = "ts"):
        # 2. Parse the Code — choose grammar based on language
        if language == "js":
            tree = self.js_parser.parse(bytes(code, "utf8"))
        else:
            tree = self.ts_parser.parse(bytes(code, "utf8"))
        return tree, (self.JS_LANGUAGE if language == "js" else self.TS_LANGUAGE)

    def extract_endpoints(self, code: str, language: str = "ts"):
        tree, lang = self.parse_code(code, language)
        
        # 3. Create the Query (The "Fishing Net")
        # This query looks for Express.js style route definitions: app.get('/path', ...)
        query_scm = """
        (call_expression
          function: (member_expression
            object: (identifier) @app_var
            property: (property_identifier) @method
            (#match? @method "^(get|post|put|delete|patch)$")
          )
          arguments: (arguments
            (string) @route_path
          )
        )
        """
        # Use QueryCursor — the correct API in tree-sitter 0.25.x
        query = Query(lang, query_scm)
        cursor = QueryCursor(query)
        
        # 4. Extract Data for Knowledge Graph
        endpoints = []
        captures = cursor.captures(tree.root_node)
        
        if 'route_path' in captures:
            for node in captures['route_path']:
                # Extract the string value, removing quotes
                path = code[node.start_byte:node.end_byte].strip("'\"`")
                endpoints.append(path)
                
        return endpoints

typescript_parser = TypeScriptASTParser()
