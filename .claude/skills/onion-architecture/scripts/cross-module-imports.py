#!/usr/bin/env python3
"""List imports that cross from one server module into another, and flag the forbidden ones.

    python3 cross-module-imports.py <repo-or-worktree> [base-ref] [--all]

Scans the server/src/modules/**/*.ts files changed against base-ref (default: main), or every
module file with --all. For each import of another module it prints the target's kind:

  VIOLATION  another module's data access: repository.ts, repository/*, *.repo.ts
             (from any file, type-only imports included)
  ok         another module's wiring.ts or service.ts from routes.ts / wiring.ts,
             or anything in modules/_shared
  check      anything else (helpers, constants, types); fine as a composition input in
             wiring.ts, otherwise `pnpm lint:boundaries` decides

Exits 1 when there is at least one VIOLATION. Read-only: runs git and reads files.
"""
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

MODULES = "server/src/modules/"
IMPORT_RE = re.compile(
    r"""(?:^|;|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]"""
    r"""|import\(\s*['"]([^'"]+)['"]\s*\)""",
    re.S,
)


def changed_files(root: Path, base: str) -> list[str]:
    out = subprocess.run(
        ["git", "-C", str(root), "diff", "--name-only", "--diff-filter=AMR", f"{base}...HEAD", "--", MODULES],
        capture_output=True, text=True, check=True,
    ).stdout
    return [f for f in out.splitlines() if f.endswith(".ts")]


def all_files(root: Path) -> list[str]:
    return sorted(str(p.relative_to(root)) for p in (root / MODULES).rglob("*.ts"))


def module_of(path: str) -> str | None:
    if not path.startswith(MODULES):
        return None
    rest = path[len(MODULES):].split("/")
    return rest[0] if len(rest) > 1 else None


def resolve(src: str, spec: str) -> str | None:
    if not spec.startswith("."):
        return None
    parts: list[str] = []
    for part in (PurePosixPath(src).parent / spec).parts:
        if part == "..":
            if parts:
                parts.pop()
        elif part != ".":
            parts.append(part)
    target = "/".join(parts)
    return re.sub(r"\.js$", ".ts", target)


def classify(src: str, target: str) -> str:
    inner = target[len(MODULES):].split("/", 1)[1]
    name = PurePosixPath(inner).name
    if module_of(target) == "_shared":
        return "ok"
    if name == "repository.ts" or inner.startswith("repository/") or name.endswith(".repo.ts"):
        return "VIOLATION"
    if name in ("wiring.ts", "service.ts") and PurePosixPath(src).name in ("routes.ts", "wiring.ts"):
        return "ok"
    return "check"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__, file=sys.stderr)
        return 2
    root = Path(args[0]).resolve()
    base = args[1] if len(args) > 1 else "main"
    files = all_files(root) if "--all" in sys.argv else changed_files(root, base)

    rows: list[tuple[str, str, str, str]] = []
    for src in files:
        own = module_of(src)
        if own is None:  # modules/index.ts is the registry and imports every routes.ts by design
            continue
        text = (root / src).read_text(encoding="utf8")
        for m in IMPORT_RE.finditer(text):
            spec = m.group(2) or m.group(3)
            target = resolve(src, spec)
            other = module_of(target) if target else None
            if not other or other == own:
                continue
            line = text.count("\n", 0, m.start(2) if m.group(2) else m.start(3)) + 1
            kind = classify(src, target)
            note = " (type-only)" if m.group(1) else ""
            rows.append((kind, f"{src.removeprefix('server/')}:{line}", target[len(MODULES):] + note, src))

    order = {"VIOLATION": 0, "check": 1, "ok": 2}
    for kind, where, target, _ in sorted(rows, key=lambda r: (order[r[0]], r[1])):
        reason = {
            "VIOLATION": "another module's data access; go through its builder/service or a container repository",
            "check": "not data access; fine as a composition input in wiring.ts, else lint decides",
            "ok": "allowed",
        }[kind]
        print(f"{kind:<9}  {where:<45}  -> {target:<40}  {reason}")
    violations = sum(1 for r in rows if r[0] == "VIOLATION")
    print(f"\n{len(files)} files scanned, {len(rows)} cross-module imports, {violations} violation(s).")
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
