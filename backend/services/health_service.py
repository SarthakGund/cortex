import os
import re
import ast
import uuid
import json
import stat
import shutil
import subprocess
from typing import List, Dict, Any, Optional, Tuple


def _force_rmdir(path: str) -> None:
    """Delete a directory tree on Windows even if git left read-only files."""
    def _on_error(func, fpath, _exc):
        try:
            os.chmod(fpath, stat.S_IWRITE)
            func(fpath)
        except Exception:
            pass
    if os.path.exists(path):
        shutil.rmtree(path, onerror=_on_error)

# Persistent clone cache — survives across requests so accept can commit back
CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cortex_health_cache")


# ─── Known-bad packages ───────────────────────────────────────────────────────
_PYTHON_VULN: Dict[str, tuple] = {
    "pyyaml":       ("5.4",    "PyYAML < 5.4 allows arbitrary code exec (CVE-2020-14343)"),
    "pillow":       ("9.3.0",  "Pillow < 9.3.0 has multiple buffer-overflow CVEs"),
    "cryptography": ("41.0.0", "cryptography < 41.0.0 uses deprecated algorithm backends"),
    "flask":        ("2.3.0",  "Flask < 2.3.0 has known security advisory (open redirect)"),
    "django":       ("4.2",    "Django < 4.2 is past its security-support EOL"),
    "requests":     ("2.28.0", "requests < 2.28.0 may leak auth headers on redirect (CVE-2023-32681)"),
    "urllib3":      ("1.26.18","urllib3 < 1.26.18 has ReDoS vulnerability (CVE-2023-45803)"),
    "aiohttp":      ("3.9.0",  "aiohttp < 3.9.0 has open redirect / header injection issues"),
}

_NODE_VULN: Dict[str, tuple] = {
    "lodash":  ("4.17.21", "lodash < 4.17.21 has prototype pollution (CVE-2021-23337)"),
    "axios":   ("1.6.0",   "axios < 1.6.0 is vulnerable to SSRF (CVE-2023-45857)"),
    "express": ("4.18.0",  "Express < 4.18.0 has known open-redirect advisories"),
    "next":    ("13.5.0",  "Next.js < 13.5.0 has open-redirect + path traversal CVEs"),
    "ws":      ("8.14.0",  "ws < 8.14.0 has DoS via excessive memory allocation"),
}


# ─── HealthService ────────────────────────────────────────────────────────────

class HealthService:
    """
    Clones a repository into a persistent cache, walks every source file,
    and returns a list of HealthIssue dicts.  The clone is kept on disk so
    that the /accept endpoint can apply fixes and push them back.
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def scan_repository(self, repo_url: str) -> Tuple[List[Dict[str, Any]], str]:
        """Clone *repo_url* and return *(issues, clone_dir)*."""
        issues: List[Dict[str, Any]] = []

        # Wipe previous clone — force-remove handles Windows read-only .git files
        _force_rmdir(CACHE_DIR)
        os.makedirs(CACHE_DIR, exist_ok=True)
        clone_dir = os.path.join(CACHE_DIR, "repo")

        try:
            subprocess.run(
                ["git", "clone", "--depth", "1",
                 "--single-branch", "--no-tags",
                 repo_url, clone_dir],
                check=True, capture_output=True, timeout=60,
            )
        except subprocess.CalledProcessError as e:
            return [self._issue(
                "clone_error", "critical",
                "Repository clone failed",
                f"git clone returned an error: {e.stderr.decode(errors='replace')[:300]}",
                "", None,
                "Verify the repository URL and that you have access.",
            )], ""

        # Configure bot identity so commits don't fail
        for cmd in (
            ["git", "-C", clone_dir, "config", "user.email", "health-bot@cortex.ai"],
            ["git", "-C", clone_dir, "config", "user.name",  "Cortex Health Bot"],
        ):
            subprocess.run(cmd, capture_output=True)

        imported_modules = self._collect_imported_modules(clone_dir)
        issues.extend(self._check_missing_readme(clone_dir))

        files_scanned = 0
        for root, dirs, files in os.walk(clone_dir):
            dirs[:] = [
                d for d in dirs
                if not d.startswith(".")
                and d not in {
                    "node_modules", "__pycache__", ".git",
                    "dist", "build", "venv", ".venv", ".mypy_cache",
                }
            ]
            for fname in files:
                abs_path = os.path.join(root, fname)
                rel_path = os.path.relpath(abs_path, clone_dir).replace("\\", "/")
                ext = os.path.splitext(fname)[1].lower()

                try:
                    with open(abs_path, "r", encoding="utf-8", errors="ignore") as fh:
                        content = fh.read()
                except OSError:
                    continue

                issues.extend(self._check_todos(rel_path, content))
                issues.extend(self._check_large_file(rel_path, content))

                files_scanned += 1
                if files_scanned >= 300:
                    break  # cap: don't scan more than 300 files

                if ext == ".py":
                    issues.extend(self._check_python_docstrings(rel_path, content))
                    issues.extend(self._check_python_complexity(rel_path, content))
                    mod_name = self._path_to_module(rel_path)
                    if mod_name and mod_name not in imported_modules:
                        issues.extend(self._flag_redundant_file(rel_path, "Python"))

                if fname == "requirements.txt":
                    issues.extend(self._check_vuln_python_deps(rel_path, content))
                if fname == "package.json":
                    issues.extend(self._check_vuln_node_deps(rel_path, content))

        return issues, clone_dir

    # ------------------------------------------------------------------
    # Fix applicator  (called by the /accept endpoint)
    # ------------------------------------------------------------------

    def apply_fix(self, issue: Dict[str, Any], clone_dir: str) -> bool:
        """
        Apply the suggested fix to the file in *clone_dir*.
        Returns True if something was changed (file modified / deleted).
        """
        issue_type = issue.get("issue_type", "")
        rel_path   = issue.get("file_path", "")
        abs_path   = os.path.join(clone_dir, rel_path) if rel_path else ""

        if issue_type == "redundant_file" and abs_path and os.path.isfile(abs_path):
            os.remove(abs_path)
            return True

        if issue_type == "missing_readme":
            readme = os.path.join(clone_dir, "README.md")
            with open(readme, "w", encoding="utf-8") as f:
                f.write(
                    "# Project\n\n"
                    "TODO: Add project description, setup instructions, and API overview.\n"
                )
            return True

        if issue_type == "missing_docstring" and abs_path and os.path.isfile(abs_path):
            return self._insert_docstring(
                abs_path,
                issue.get("title", ""),
                issue.get("line", 1) or 1,
            )

        if issue_type == "vulnerable_dep" and abs_path and os.path.isfile(abs_path):
            return self._fix_vulnerable_dep(abs_path, issue)

        # Advisory issue (todo_comment, large_file, high_complexity, clone_error):
        # No auto-fix possible, but we still commit an audit log entry so Accept
        # always results in a real git commit+push rather than a silent dismiss.
        if clone_dir and os.path.isdir(clone_dir):
            return self._append_audit_log(clone_dir, issue)

        return False

    def _append_audit_log(self, clone_dir: str, issue: Dict[str, Any]) -> bool:
        """Append an accepted-issue entry to CORTEX_HEALTH_AUDIT.md in the repo."""
        import datetime
        audit_path = os.path.join(clone_dir, "CORTEX_HEALTH_AUDIT.md")
        ts = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        exists = os.path.isfile(audit_path)
        try:
            with open(audit_path, "a", encoding="utf-8") as f:
                if not exists:
                    f.write("# Cortex Health Audit Log\n\n"
                            "Issues accepted by the Cortex Living Knowledge Graph system.\n\n"
                            "---\n\n")
                f.write(
                    f"## {issue.get('title', 'Issue')}  \n"
                    f"**Type:** {issue.get('issue_type', '')}  \n"
                    f"**Severity:** {issue.get('severity', '')}  \n"
                    f"**File:** {issue.get('file_path', 'N/A')}  \n"
                    f"**Accepted at:** {ts}  \n"
                    f"**Suggested fix:** {issue.get('suggested_fix', '')}  \n\n"
                    "---\n\n"
                )
            return True
        except Exception:
            return False


    def _insert_docstring(self, abs_path: str, title: str, lineno: int) -> bool:
        """Insert a placeholder docstring after the function/class def line."""
        try:
            with open(abs_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

            i = lineno - 1
            def_end = i
            for j in range(i, min(i + 10, len(lines))):
                if lines[j].rstrip().endswith(":"):
                    def_end = j
                    break

            if def_end + 1 >= len(lines):
                return False

            body_line = lines[def_end + 1]
            indent = len(body_line) - len(body_line.lstrip())
            pad = " " * indent

            name_match = re.search(r"`(\w+)`", title)
            name = name_match.group(1) if name_match else "this function"

            # Build docstring without embedding newlines inside a string literal
            docstring = pad + '"""TODO: Document ' + name + ". Describe its purpose, parameters, and return value." + '"""\n'
            lines.insert(def_end + 1, docstring)

            with open(abs_path, "w", encoding="utf-8") as f:
                f.writelines(lines)
            return True
        except Exception:
            return False

    def _fix_vulnerable_dep(self, abs_path: str, issue: Dict) -> bool:
        """Pin a vulnerable Python requirement to its minimum safe version."""
        try:
            title = issue.get("title", "")
            m = re.search(r"vulnerable dependency: (\S+)", title, re.IGNORECASE)
            if not m:
                return False
            pkg = m.group(1).lower()
            min_ver = _PYTHON_VULN.get(pkg, (None, None))[0]
            if not min_ver:
                return False

            with open(abs_path, "r", encoding="utf-8") as f:
                content = f.read()
            new_content = re.sub(
                rf"^({re.escape(pkg)})\s*[=<>!~][^\n]*",
                rf"\1>={min_ver}",
                content,
                flags=re.IGNORECASE | re.MULTILINE,
            )
            if new_content == content:
                return False
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            return True
        except Exception:
            return False

    # ------------------------------------------------------------------
    # File-level checks
    # ------------------------------------------------------------------

    def _check_missing_readme(self, tmp: str) -> List[Dict]:
        names = {f.lower() for f in os.listdir(tmp) if os.path.isfile(os.path.join(tmp, f))}
        if not any("readme" in n for n in names):
            return [self._issue(
                "missing_readme", "warning",
                "No README at repository root",
                "The repository has no README file. Service nodes in the knowledge graph "
                "will lack human-readable documentation.",
                "", None,
                "Add a README.md that explains the service's purpose, architecture, and setup.",
            )]
        return []

    def _check_todos(self, rel_path: str, content: str) -> List[Dict]:
        issues = []
        pattern = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b:?\s*(.{0,120})", re.IGNORECASE)
        for lineno, line in enumerate(content.splitlines(), 1):
            m = pattern.search(line)
            if m:
                tag = m.group(1).upper()
                msg = m.group(2).strip()
                severity = "warning" if tag in ("TODO", "FIXME") else "info"
                issues.append(self._issue(
                    "todo_comment", severity,
                    f"{tag}: {msg[:60]}{'…' if len(msg) > 60 else ''}",
                    f"Unresolved technical-debt marker at line {lineno} in `{rel_path}`.",
                    rel_path, lineno,
                    f"Resolve the {tag} or open a tracking issue and remove the comment.",
                ))
        return issues

    def _check_large_file(self, rel_path: str, content: str) -> List[Dict]:
        lines = content.count("\n")
        if lines > 500:
            return [self._issue(
                "large_file", "info",
                f"File exceeds 500 lines ({lines} lines)",
                f"`{rel_path}` is {lines} lines long. Large files are harder to document.",
                rel_path, None,
                "Consider splitting into smaller, focused modules.",
            )]
        return []

    def _check_python_docstrings(self, rel_path: str, content: str) -> List[Dict]:
        issues = []
        try:
            tree = ast.parse(content)
        except SyntaxError:
            return []

        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            name: str = node.name
            if name.startswith("_"):
                continue
            has_doc = (
                node.body
                and isinstance(node.body[0], ast.Expr)
                and isinstance(node.body[0].value, ast.Constant)
                and isinstance(node.body[0].value.value, str)
            )
            if not has_doc:
                kind = "Class" if isinstance(node, ast.ClassDef) else "Function"
                issues.append(self._issue(
                    "missing_docstring", "warning",
                    f"Missing docstring — {kind} `{name}`",
                    f"`{name}` in `{rel_path}` (line {node.lineno}) has no docstring.",
                    rel_path, node.lineno,
                    f"Add a docstring to `{name}` that describes its purpose, parameters, and return value.",
                ))
        return issues

    def _check_python_complexity(self, rel_path: str, content: str) -> List[Dict]:
        issues = []
        try:
            tree = ast.parse(content)
        except SyntaxError:
            return []

        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            depth = self._max_nesting(node)
            if depth > 4:
                issues.append(self._issue(
                    "high_complexity", "warning",
                    f"High nesting depth ({depth}) — `{node.name}`",
                    f"`{node.name}` in `{rel_path}` has maximum nesting depth of {depth}.",
                    rel_path, node.lineno,
                    "Refactor using early returns, guard clauses, or extract helper functions.",
                ))
        return issues

    def _max_nesting(self, node: ast.AST, depth: int = 0) -> int:
        BRANCH = (ast.If, ast.For, ast.While, ast.With, ast.Try, ast.ExceptHandler)
        max_d = depth
        for child in ast.iter_child_nodes(node):
            if isinstance(child, BRANCH):
                max_d = max(max_d, self._max_nesting(child, depth + 1))
            else:
                max_d = max(max_d, self._max_nesting(child, depth))
        return max_d

    def _flag_redundant_file(self, rel_path: str, lang: str) -> List[Dict]:
        return [self._issue(
            "redundant_file", "info",
            f"Possibly unreferenced {lang} file",
            f"`{rel_path}` appears not to be imported by any other file in the repository.",
            rel_path, None,
            "Remove this file if it is truly unused, or add it to the appropriate module.",
            can_delete=True,
        )]

    def _check_vuln_python_deps(self, rel_path: str, content: str) -> List[Dict]:
        issues = []
        for line in content.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            for pkg, (min_ver, description) in _PYTHON_VULN.items():
                if re.match(rf"^{re.escape(pkg)}\s*[=<>!~]", stripped, re.IGNORECASE):
                    issues.append(self._issue(
                        "vulnerable_dep", "critical",
                        f"Vulnerable dependency: {pkg}",
                        description,
                        rel_path, None,
                        f"Upgrade `{pkg}` to >= {min_ver} in {rel_path}.",
                    ))
        return issues

    def _check_vuln_node_deps(self, rel_path: str, content: str) -> List[Dict]:
        issues = []
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return []
        deps: Dict[str, str] = {}
        deps.update(data.get("dependencies", {}))
        deps.update(data.get("devDependencies", {}))
        for pkg, (min_ver, description) in _NODE_VULN.items():
            if pkg in deps:
                issues.append(self._issue(
                    "vulnerable_dep", "critical",
                    f"Vulnerable dependency: {pkg}",
                    description,
                    rel_path, None,
                    f"Upgrade `{pkg}` to >= {min_ver} in {rel_path}.",
                ))
        return issues

    # ------------------------------------------------------------------
    # Dead-code helpers
    # ------------------------------------------------------------------

    def _collect_imported_modules(self, root: str) -> set:
        imported = set()
        pattern = re.compile(
            r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.,\s]+))", re.MULTILINE
        )
        for dirpath, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in {"node_modules", "__pycache__", ".git"}]
            for f in files:
                if not f.endswith(".py"):
                    continue
                try:
                    with open(os.path.join(dirpath, f), "r", encoding="utf-8", errors="ignore") as fh:
                        content = fh.read()
                    for m in pattern.finditer(content):
                        mod = (m.group(1) or m.group(2) or "").strip()
                        for part in mod.split(","):
                            imported.add(part.strip().split(".")[0])
                except OSError:
                    pass
        return imported

    def _path_to_module(self, rel_path: str) -> Optional[str]:
        if not rel_path.endswith(".py"):
            return None
        base = os.path.basename(rel_path).replace(".py", "")
        if base in ("__init__", "conftest", "setup", "manage"):
            return None
        return base

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    def _issue(
        self,
        issue_type: str,
        severity: str,
        title: str,
        description: str,
        file_path: str,
        line: Optional[int],
        suggested_fix: str,
        can_delete: bool = False,
    ) -> Dict[str, Any]:
        return {
            "id":            str(uuid.uuid4()),
            "issue_type":    issue_type,
            "severity":      severity,
            "title":         title,
            "description":   description,
            "file_path":     file_path,
            "line":          line,
            "suggested_fix": suggested_fix,
            "can_delete":    can_delete,
            "status":        "pending",
        }


health_service = HealthService()
