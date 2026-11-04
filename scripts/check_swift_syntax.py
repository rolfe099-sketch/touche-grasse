"""Optional tree-sitter check. This cannot resolve types, imports, SDKs, or compiler diagnostics."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".verification-tools"))
from tree_sitter import Language, Parser
import tree_sitter_swift

parser = Parser(Language(tree_sitter_swift.language()))
failures = []
files = sorted(p for directory in ["Packages", "ToucheGrasse", "ToucheGrasseUITests"] for p in (ROOT / directory).rglob("*.swift"))
for path in files:
    tree = parser.parse(path.read_bytes())
    stack = [tree.root_node]
    while stack:
        node = stack.pop()
        if node.type == "ERROR" or node.is_missing:
            failures.append({"file": str(path.relative_to(ROOT)), "line": node.start_point.row + 1,
                             "column": node.start_point.column + 1, "kind": node.type})
        stack.extend(node.children)
report = {"scope": "Syntax parsing only; not Swift compiler, type checking, XCTest, or iOS validation", "files": len(files), "errors": failures}
(ROOT / "verification/swift-syntax.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
raise SystemExit(bool(failures))
