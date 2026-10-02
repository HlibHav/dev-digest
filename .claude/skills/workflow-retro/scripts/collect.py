#!/usr/bin/env python3
"""Collect hard numbers for a workflow retro from Claude Code session transcripts.

Reads the main session JSONL plus every subagent transcript beside it and prints a
Markdown report: per-agent tokens, tool calls, duration, model, launch order and
overlap, files read by more than one agent, rule hits and tool errors.

Usage:
  collect.py [--session PATH_OR_ID] [--project-dir DIR] [--since ISO] [--json]

With no --session it takes the newest *.jsonl in the project dir derived from the
current working directory (~/.claude/projects/<cwd with non-alphanumerics as '-'>).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

# Commands worth flagging in a retro. Pattern kills hit sibling processes; the rest
# are the usual irreversible or gate-skipping moves.
RULE_PATTERNS: dict[str, re.Pattern[str]] = {
    # Command position only (line start or after ; & | ( or sudo), so a grep for the
    # word or a PR body that mentions it doesn't count. `pkill -P <pid>` is by parent.
    "kill-by-pattern": re.compile(r"(?m)(?:^|[;&|(]|\bsudo)\s*(?:pkill|killall)\b(?!\s+-P\b)"),
    "no-verify": re.compile(r"--no-verify\b"),
    "force-push": re.compile(r"git\s+push\b.*(--force\b|-f\b)"),
    "rm-rf": re.compile(r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r"),
    "bare-git-stash": re.compile(r"git\s+stash(\s+pop)?\s*($|;|&&)"),
}


@dataclass
class Usage:
    input: int = 0
    output: int = 0
    cache_read: int = 0
    cache_write: int = 0
    peak_context: int = 0

    def add(self, u: dict[str, Any]) -> None:
        i, o = u.get("input_tokens", 0) or 0, u.get("output_tokens", 0) or 0
        cr = u.get("cache_read_input_tokens", 0) or 0
        cw = u.get("cache_creation_input_tokens", 0) or 0
        self.input, self.output = self.input + i, self.output + o
        self.cache_read, self.cache_write = self.cache_read + cr, self.cache_write + cw
        self.peak_context = max(self.peak_context, i + cr + cw)

    @property
    def total(self) -> int:
        return self.input + self.output + self.cache_read + self.cache_write


@dataclass
class Agent:
    key: str
    label: str
    agent_type: str = "main"
    model: str = ""
    background: bool | None = None
    usage: Usage = field(default_factory=Usage)
    tool_calls: Counter[str] = field(default_factory=Counter)
    errors: list[str] = field(default_factory=list)
    rule_hits: list[str] = field(default_factory=list)
    files_read: set[str] = field(default_factory=set)
    files_written: set[str] = field(default_factory=set)
    start: datetime | None = None
    end: datetime | None = None

    @property
    def minutes(self) -> float:
        if not (self.start and self.end):
            return 0.0
        return (self.end - self.start).total_seconds() / 60


HEREDOC = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?[^\n]*\n.*?^\s*\1\s*$", re.S | re.M)
QUOTED = re.compile(r"'[^']*'|\"(?:\\.|[^\"\\])*\"")


def strip_quoted(cmd: str) -> str:
    """Drop heredoc bodies and quoted strings, so only what the shell runs is matched."""
    return QUOTED.sub("''", HEREDOC.sub("", cmd))


def ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def lines(path: Path) -> Iterator[dict[str, Any]]:
    with path.open(encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                yield json.loads(raw)
            except json.JSONDecodeError:
                continue


def scan(path: Path, agent: Agent, since: datetime | None) -> list[dict[str, Any]]:
    """Fill `agent` from one transcript. Returns the Agent/Workflow launches it made."""
    seen_msg: set[str] = set()
    launches: list[dict[str, Any]] = []
    for d in lines(path):
        t = ts(d.get("timestamp"))
        if since and t and t < since:
            continue
        if t:
            agent.start = min(agent.start, t) if agent.start else t
            agent.end = max(agent.end, t) if agent.end else t
        msg = d.get("message") or {}
        if d.get("type") == "assistant":
            mid = msg.get("id") or d.get("requestId") or d.get("uuid")
            # One API message is split across several JSONL lines, each carrying the
            # same usage; count it once.
            if mid not in seen_msg and msg.get("usage"):
                seen_msg.add(mid)
                agent.usage.add(msg["usage"])
                if not agent.model and msg.get("model"):
                    agent.model = msg["model"]
            for c in msg.get("content") or []:
                if c.get("type") != "tool_use":
                    continue
                name, inp = c.get("name", "?"), c.get("input") or {}
                agent.tool_calls[name] += 1
                fp = inp.get("file_path") or inp.get("notebook_path")
                if name == "Read" and fp:
                    agent.files_read.add(fp)
                if name in ("Edit", "Write", "NotebookEdit") and fp:
                    agent.files_written.add(fp)
                if name == "Bash":
                    cmd = inp.get("command", "")
                    bare = strip_quoted(cmd)
                    for rule, pat in RULE_PATTERNS.items():
                        if pat.search(bare):
                            agent.rule_hits.append(f"{rule}: {cmd.strip()[:160]}")
                if name in ("Agent", "Task", "Workflow"):
                    launches.append({"at": t, "tool": name, "input": inp, "id": c.get("id")})
        elif d.get("type") == "user":
            content = msg.get("content")
            if isinstance(content, list):
                for b in content:
                    if b.get("type") == "tool_result" and b.get("is_error"):
                        text = b.get("content")
                        if isinstance(text, list):
                            text = " ".join(x.get("text", "") for x in text if isinstance(x, dict))
                        agent.errors.append(str(text).strip().replace("\n", " ")[:160])
    return launches


def project_dir_for(cwd: Path) -> Path:
    return Path.home() / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(cwd))


def resolve_session(arg: str | None, project_dir: Path) -> Path:
    if arg:
        p = Path(arg).expanduser()
        if p.is_file():
            return p
        cand = project_dir / f"{arg}.jsonl"
        if cand.is_file():
            return cand
        sys.exit(f"session not found: {arg}")
    files = sorted(project_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        sys.exit(f"no session transcripts in {project_dir}")
    return files[0]


def fmt(n: int) -> str:
    return f"{n / 1000:.1f}k" if n >= 1000 else str(n)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session")
    ap.add_argument("--project-dir")
    ap.add_argument("--since", help="ISO timestamp; ignore transcript lines before it")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    project_dir = Path(a.project_dir).expanduser() if a.project_dir else project_dir_for(Path.cwd())
    session = resolve_session(a.session, project_dir)
    since = ts(a.since)
    if a.since and not since:
        sys.exit(f"bad --since: {a.since}")

    main_agent = Agent(key="main", label="main session")
    launches = scan(session, main_agent, since)

    sub_dir = session.with_suffix("") / "subagents"
    subs: list[Agent] = []
    for tp in sorted(sub_dir.glob("agent-*.jsonl")) if sub_dir.is_dir() else []:
        meta_p = tp.with_suffix(".meta.json")
        meta = json.loads(meta_p.read_text()) if meta_p.is_file() else {}
        ag = Agent(
            key=tp.stem.removeprefix("agent-"),
            label=meta.get("description") or tp.stem,
            agent_type=meta.get("agentType", "?"),
            model=meta.get("model", ""),
            background=meta.get("requestShape") == "background" if meta else None,
        )
        scan(tp, ag, since)
        if ag.start:  # skip agents entirely before --since
            subs.append(ag)
    subs.sort(key=lambda x: x.start or datetime.max)

    everyone = [main_agent, *subs]
    readers: dict[str, list[str]] = defaultdict(list)
    for ag in everyone:
        for f in ag.files_read:
            readers[f].append(ag.label)
    shared_reads = {f: who for f, who in readers.items() if len(who) > 1}

    if a.json:
        out = {
            "session": str(session),
            "agents": [
                {
                    "label": ag.label, "type": ag.agent_type, "model": ag.model,
                    "background": ag.background, "start": ag.start.isoformat() if ag.start else None,
                    "minutes": round(ag.minutes, 1), "tokens": vars(ag.usage) | {"total": ag.usage.total},
                    "tool_calls": dict(ag.tool_calls), "errors": ag.errors, "rule_hits": ag.rule_hits,
                    "files_read": sorted(ag.files_read), "files_written": sorted(ag.files_written),
                }
                for ag in everyone
            ],
            "shared_reads": shared_reads,
            "launches": [{"at": l["at"].isoformat() if l["at"] else None, "tool": l["tool"],
                          "description": l["input"].get("description"), "model": l["input"].get("model")}
                         for l in launches],
        }
        print(json.dumps(out, indent=2, default=str))
        return

    print(f"# Workflow retro data\n\nSession: `{session}`")
    if since:
        print(f"Window: from {since.isoformat()}")
    tot = Usage()
    for ag in everyone:
        for k in ("input", "output", "cache_read", "cache_write"):
            setattr(tot, k, getattr(tot, k) + getattr(ag.usage, k))
    print(f"\nAgents launched: {len(subs)} · Workflow calls: {sum(1 for l in launches if l['tool'] == 'Workflow')}")
    print(f"Tokens, all agents: {fmt(tot.total)} total = input {fmt(tot.input)} · output {fmt(tot.output)} "
          f"· cache read {fmt(tot.cache_read)} · cache write {fmt(tot.cache_write)}")

    print("\n## Per agent (launch order)\n")
    print("| # | agent | type · model | bg | start | min | tokens total | cache write | peak ctx | tool calls | errors |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for i, ag in enumerate(everyone):
        print(f"| {i} | {ag.label} | {ag.agent_type} · {ag.model or '?'} | "
              f"{'' if ag.background is None else ('yes' if ag.background else 'no')} | "
              f"{ag.start.strftime('%H:%M:%S') if ag.start else '?'} | {ag.minutes:.1f} | "
              f"{fmt(ag.usage.total)} | {fmt(ag.usage.cache_write)} | {fmt(ag.usage.peak_context)} | "
              f"{sum(ag.tool_calls.values())} | {len(ag.errors)} |")

    print("\n## Parallelism\n")
    for x, y in ((x, y) for i, x in enumerate(subs) for y in subs[i + 1:]):
        if x.start and x.end and y.start and y.end and x.start < y.end and y.start < x.end:
            ov = (min(x.end, y.end) - max(x.start, y.start)).total_seconds() / 60
            print(f"- overlap {ov:.1f} min: {x.label} ∥ {y.label}")
    if len(subs) < 2:
        print("- fewer than two subagents")

    print("\n## Tool mix\n")
    for ag in everyone:
        top = ", ".join(f"{n}×{c}" for n, c in ag.tool_calls.most_common(6))
        print(f"- {ag.label}: {top or 'none'}")

    print("\n## Files read by more than one agent (duplication candidates)\n")
    for f, who in sorted(shared_reads.items(), key=lambda kv: -len(kv[1]))[:25] or []:
        print(f"- `{f}` — {', '.join(who)}")
    if not shared_reads:
        print("- none")

    print("\n## Rule hits\n")
    hits = [(ag.label, h) for ag in everyone for h in ag.rule_hits]
    for label, h in hits:
        print(f"- {label}: `{h}`")
    if not hits:
        print("- none")

    print("\n## Tool errors\n")
    errs = [(ag.label, e) for ag in everyone for e in ag.errors]
    for label, e in errs[:30]:
        print(f"- {label}: {e}")
    if not errs:
        print("- none")


if __name__ == "__main__":
    main()
