import tree_sitter_python as tspython
from tree_sitter import Language, Parser, Query, QueryCursor

class PythonASTParser:
    def __init__(self):
        # 1. Setup the Parser (Load Python Grammar)
        self.PY_LANGUAGE = Language(tspython.language())
        self.parser = Parser(self.PY_LANGUAGE)

    def parse_code(self, code: str):
        # 2. Parse the Code
        tree = self.parser.parse(bytes(code, "utf8"))
        return tree

    def extract_endpoints(self, code: str):
        tree = self.parse_code(code)
        
        # 3. Create the Query (The "Fishing Net")
        # This query looks for FastAPI/Flask style route decorators
        query_scm = """
        (decorator
          (call
            function: (attribute attribute: (identifier) @method_name)
            arguments: (argument_list (string) @route_path)
          )
        )
        """
        # Use QueryCursor — the correct API in tree-sitter 0.25.x
        query = Query(self.PY_LANGUAGE, query_scm)
        cursor = QueryCursor(query)
        
        # 4. Extract Data for Knowledge Graph
        endpoints = []
        captures = cursor.captures(tree.root_node)
        
        if 'route_path' in captures:
            for node in captures['route_path']:
                # Extract the string value, removing quotes
                path = code[node.start_byte:node.end_byte].strip("'\"")
                endpoints.append(path)
                
        return endpoints

    def extract_function_definitions(self, code: str):
        tree = self.parse_code(code)
        
        query_scm = """
        (function_definition
          name: (identifier) @func_name
        )
        """
        query = Query(self.PY_LANGUAGE, query_scm)
        cursor = QueryCursor(query)
        
        functions = []
        captures = cursor.captures(tree.root_node)
        
        if 'func_name' in captures:
            for node in captures['func_name']:
                name = code[node.start_byte:node.end_byte]
                functions.append(name)
                
        return functions

python_parser = PythonASTParser()
