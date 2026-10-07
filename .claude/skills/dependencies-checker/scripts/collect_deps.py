#!/usr/bin/env python3
"""Collect dependency facts for every npm package in a repo, read-only.

    python3 collect_deps.py <repo-root> [--json out.json]

Finds each package.json outside node_modules, .claude/, .skill-evals/, server/clones/ and
dist/build output, then reports per package:
  - declared dependencies by type (prod, dev, peer, optional) with their ranges
  - the installed version and own installed size of every direct dependency
    (realpath, so pnpm's .pnpm store is followed; "own" excludes the dependency's own deps)
  - total installed size of node_modules (hard links counted once) and installed package count
  - install health: no node_modules, or declared deps missing from it (a stale install)
  - direct deps with no import or config reference found ("possibly unused")
  - internal links: tsconfig path aliases into other packages, mirrored source folders,
    and HTTP clients of the API
Across packages it reports dependencies declared in more than one package and their version
drift. It prints JSON (and a Mermaid graph under "mermaid"). Never installs, updates or writes
inside the repo; no network.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SKIP_DIRS = {"node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", "clones", ".skill-evals"}
SOURCE_EXT = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".mts", ".cts", ".json", ".css"}
BUILD_TOOLS = {
    "typescript", "tsx", "vitest", "@vitest/coverage-v8", "drizzle-kit", "dependency-cruiser",
    "eslint", "prettier", "testcontainers", "@testcontainers/postgresql", "jsdom", "happy-dom",
    "@testing-library/react", "@testing-library/jest-dom", "@testing-library/user-event",
    "@vitejs/plugin-react", "vite", "postcss", "tailwindcss", "autoprefixer",
}


def find_packages(root: Path) -> list[Path]:
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel = Path(dirpath).relative_to(root)
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not (rel == Path(".") and d == ".claude")]
        if "package.json" in filenames and Path(dirpath) != root:
            found.append(Path(dirpath))
    return sorted(found)


def du_kb(path: Path) -> int | None:
    if not path.exists():
        return None
    out = subprocess.run(["du", "-sk", str(path)], capture_output=True, text=True)
    try:
        return int(out.stdout.split()[0])
    except (IndexError, ValueError):
        return None


def own_size_kb(path: Path) -> int:
    """Size of a package directory without nested node_modules, hard links counted once."""
    seen: set[tuple[int, int]] = set()
    total = 0
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames[:] = [d for d in dirnames if d != "node_modules"]
        for f in filenames:
            try:
                st = os.lstat(os.path.join(dirpath, f))
            except OSError:
                continue
            key = (st.st_dev, st.st_ino)
            if key in seen:
                continue
            seen.add(key)
            total += st.st_blocks * 512 if hasattr(st, "st_blocks") else st.st_size
    return total // 1024


def manager(pkg: Path) -> str:
    if (pkg / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (pkg / "package-lock.json").exists():
        return "npm"
    if (pkg / "yarn.lock").exists():
        return "yarn"
    return "unknown"


def installed_count(pkg: Path, mgr: str) -> int | None:
    """Packages physically installed: pnpm's isolated store, else a walk of (hoisted) node_modules."""
    nm = pkg / "node_modules"
    if not nm.is_dir():
        return None
    store = nm / ".pnpm"
    if store.is_dir():
        entries = [d for d in store.iterdir() if d.is_dir() and d.name != "node_modules"]
        if entries:
            return len(entries)
    count = 0
    stack = [nm]
    while stack:
        cur = stack.pop()
        for d in cur.iterdir():
            if d.name.startswith(".") or not d.is_dir() or d.is_symlink():
                continue
            if d.name.startswith("@"):
                stack.append(d)
                continue
            if (d / "package.json").exists():
                count += 1
                if (d / "node_modules").is_dir():
                    stack.append(d / "node_modules")
    return count


def dep_kind(name: str, section: str) -> str:
    if name.startswith("@types/"):
        return "types"
    if section == "devDependencies" and (name in BUILD_TOOLS or name.startswith("@vitest/")):
        return "build/test tool"
    return "runtime" if section == "dependencies" else "dev library"


def source_text(pkg: Path) -> str:
    chunks = []
    for dirpath, dirnames, filenames in os.walk(pkg):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            p = Path(dirpath) / f
            if p.suffix in SOURCE_EXT and f not in ("package.json", "package-lock.json") and p.stat().st_size < 2_000_000:
                try:
                    chunks.append(p.read_text(errors="ignore"))
                except OSError:
                    pass
    return "\n".join(chunks)


def bin_names(nm: Path, name: str) -> list[str]:
    try:
        manifest = json.loads(((nm / name).resolve() / "package.json").read_text())
    except (OSError, json.JSONDecodeError):
        return {"typescript": ["tsc"]}.get(name, [])
    b = manifest.get("bin")
    if isinstance(b, str):
        return [name.split("/")[-1]]
    return list(b) if isinstance(b, dict) else []


def peers_of_declared(nm: Path, names: list[str]) -> set[str]:
    """Packages that some declared dependency lists as a peer: used implicitly (react-dom under next)."""
    out: set[str] = set()
    for n in names:
        try:
            manifest = json.loads(((nm / n).resolve() / "package.json").read_text())
        except (OSError, json.JSONDecodeError):
            continue
        out.update(manifest.get("peerDependencies", {}))
    return out


def config_text(pkg: Path) -> str:
    return "\n".join(p.read_text(errors="ignore") for p in pkg.glob("*.config.*") if p.is_file())


def referenced(name: str, text: str, scripts: str) -> bool:
    if name.startswith("@types/"):
        base = name[len("@types/"):]
        base = base.replace("__", "/") if "__" in base else base
        return referenced(base, text, scripts) or base in ("node", "react", "react-dom")
    pat = re.compile(r"""(?:from\s+|require\(\s*|import\(\s*|@?import\s+)['"]""" + re.escape(name) + r"""(?:/[^'"]*)?['"]""")
    if pat.search(text):
        return True
    bin_name = name.split("/")[-1]
    if re.search(rf"(^|[\s;&|]){re.escape(bin_name)}([\s]|$)", scripts):
        return True
    # config files name plugins and presets as plain strings (next.config, vitest.config, tsconfig "types")
    return f"'{name}'" in text or f'"{name}"' in text


def internal_links(root: Path, pkg: Path, pkgs: list[Path]) -> list[dict]:
    links = []
    tsconfig = pkg / "tsconfig.json"
    if tsconfig.exists():
        raw = re.sub(r"//[^\n]*", "", tsconfig.read_text())
        raw = re.sub(r",(\s*[}\]])", r"\1", raw)
        try:
            paths = json.loads(raw).get("compilerOptions", {}).get("paths", {})
        except json.JSONDecodeError:
            paths = {}
        for alias, targets in paths.items():
            if alias.endswith("/*"):
                continue
            for t in targets:
                target = (pkg / t).resolve()
                for other in pkgs:
                    if other != pkg and str(target).startswith(str(other.resolve()) + os.sep):
                        links.append({"to": str(other.relative_to(root)), "kind": "path alias", "detail": f"{alias} -> {t}"})
    srv_shared = root / "server/src/vendor/shared"
    mirror = pkg / "src/vendor/shared"
    if mirror.is_dir() and srv_shared.is_dir() and pkg.resolve() != (root / "server").resolve():
        links.append({"to": "server", "kind": "mirrored copy", "detail": "src/vendor/shared copies server/src/vendor/shared"})
    text = source_text(pkg / "src") if (pkg / "src").is_dir() else ""
    if re.search(r"API_BASE|API_URL|DEVDIGEST_API|localhost:3001", text) and pkg.name != "server":
        links.append({"to": "server", "kind": "HTTP", "detail": "calls the DevDigest API"})
    return links


def collect(root: Path) -> dict:
    pkgs = find_packages(root)
    result = {"root": str(root), "packages": [], "shared_dependencies": [], "notes": []}
    declared: dict[str, list[tuple[str, str, str]]] = {}
    for pkg in pkgs:
        rel = str(pkg.relative_to(root))
        manifest = json.loads((pkg / "package.json").read_text())
        mgr = manager(pkg)
        nm = pkg / "node_modules"
        text = source_text(pkg)
        scripts = " ".join(manifest.get("scripts", {}).values())
        all_names = [n for sec in ("dependencies", "devDependencies") for n in manifest.get(sec, {})]
        implicit = peers_of_declared(nm, all_names)
        configs = config_text(pkg)
        deps = []
        for section, label in (("dependencies", "prod"), ("devDependencies", "dev"),
                               ("peerDependencies", "peer"), ("optionalDependencies", "optional")):
            for name, rng in sorted(manifest.get(section, {}).items()):
                entry = {"name": name, "type": label, "kind": dep_kind(name, section), "range": rng,
                         "installed": None, "own_size_kb": None,
                         "referenced": referenced(name, text, scripts)
                         or name in implicit
                         or any(re.search(rf"(^|[\s;&|]){re.escape(b)}(\s|$)", scripts) for b in bin_names(nm, name))
                         or re.search(rf"(?<![\w@/-]){re.escape(name)}(?![\w/-])", configs) is not None}
                link = nm / name
                if link.exists():
                    real = link.resolve()
                    try:
                        entry["installed"] = json.loads((real / "package.json").read_text()).get("version")
                    except (OSError, json.JSONDecodeError):
                        pass
                    entry["own_size_kb"] = own_size_kb(real)
                deps.append(entry)
                declared.setdefault(name, []).append((rel, rng, entry["installed"] or ""))
        missing = [d["name"] for d in deps if d["installed"] is None and d["type"] in ("prod", "dev")]
        health = "not installed" if not nm.is_dir() else ("stale: declared but not installed" if missing else "ok")
        result["packages"].append({
            "path": rel,
            "name": manifest.get("name", rel),
            "manager": mgr,
            "counts": {t: sum(1 for d in deps if d["type"] == t) for t in ("prod", "dev", "peer", "optional")},
            "node_modules_kb": du_kb(nm),
            "installed_packages": installed_count(pkg, mgr),
            "install_health": health,
            "missing_from_install": missing if nm.is_dir() else [],
            "possibly_unused": [d["name"] for d in deps if not d["referenced"] and d["kind"] != "types"],
            "dependencies": deps,
            "links": internal_links(root, pkg, pkgs),
        })
    for name, uses in sorted(declared.items()):
        if len(uses) < 2:
            continue
        majors = {re.sub(r"^[^\d]*", "", (inst or rng)).split(".")[0] for _, rng, inst in uses}
        result["shared_dependencies"].append({
            "name": name,
            "packages": [{"path": p, "range": r, "installed": i or None} for p, r, i in uses],
            "major_drift": len(majors) > 1,
        })
    result["mermaid"] = mermaid(result)
    return result


def mermaid(result: dict) -> str:
    def nid(path: str) -> str:
        return re.sub(r"\W", "_", path)
    lines = ["graph LR"]
    for p in result["packages"]:
        size = p["node_modules_kb"]
        label = f"{p['path']}<br/>{p['counts']['prod']} prod / {p['counts']['dev']} dev"
        if size is not None:
            label += f"<br/>{size / 1024:.0f} MB installed"
        lines.append(f'  {nid(p["path"])}["{label}"]')
    for p in result["packages"]:
        for link in p["links"]:
            arrow = "-.->" if link["kind"] != "path alias" else "-->"
            lines.append(f'  {nid(p["path"])} {arrow}|{link["kind"]}| {nid(link["to"])}')
    for p in result["packages"]:
        heavy = sorted((d for d in p["dependencies"] if d["type"] == "prod" and d["own_size_kb"]),
                       key=lambda d: -d["own_size_kb"])[:3]
        for d in heavy:
            dep_id = nid(p["path"] + "_" + d["name"])
            lines.append(f'  {dep_id}(["{d["name"]} {d["own_size_kb"] / 1024:.1f} MB"])')
            lines.append(f"  {nid(p['path'])} --- {dep_id}")
    return "\n".join(lines)


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__, file=sys.stderr)
        return 2
    data = collect(Path(args[0]).resolve())
    if "--json" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--json") + 1])
        out.write_text(json.dumps(data, indent=2))
        print(f"wrote {out}")
    else:
        print(json.dumps(data, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
