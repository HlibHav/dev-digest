#!/usr/bin/env python3
"""Where did a subagent's tokens go? Aggregate one or more subagent JSONL transcripts.

    .claude/scripts/profile-subagents.py <label>=<transcript.jsonl> [<label>=<transcript.jsonl> ...]

A transcript is the file Claude Code keeps per subagent run under
`~/.claude/projects/<project-dir>/subagents/agent-<id>.jsonl` (the `output_file` a task
notification names is a symlink to it). Two labels also print the cross-transcript overlap:
files both agents read and commands both ran.

Reports, per transcript: API requests and usage (cache creation / read / output, context size
per request and the largest jumps), tool calls by name with result sizes, the ten largest
results, every path and command with counts, re-reads, and result volume by bucket (diff,
source, tests, check output, docs). Chars/4 is the rough token figure; the measured ratio on
code and JSON was 2.6–2.8 chars per token, so those figures undercount by ~30%.

Baseline, 2026-09-26, both reviewers on the 66-file intent-layer diff: architecture-reviewer
31 requests, 22.5k → 156k context, 0 Grep; plan-verifier 41 requests, 23.3k → 152k, 10 turns
lost to hook denials; ~40k tokens of the same reading between them.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

REPO = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def parse_args(argv):
    files = {}
    for arg in argv:
        label, sep, path = arg.partition("=")
        if not sep or not path:
            sys.exit(__doc__.split("\n\n")[1])
        files[label] = path
    if not files:
        sys.exit(__doc__.split("\n\n")[1])
    return files


def short(p):
    if not isinstance(p, str):
        return str(p)
    return p.replace(REPO + "/", "").replace(os.path.dirname(os.path.dirname(REPO)) + "/", "")


def key_of(name, inp):
    """Dedup key: file path for Read/Grep/Glob, command for Bash."""
    if name == "Read":
        return short(inp.get("file_path", "?"))
    if name == "Grep":
        return "grep %s :: %s" % (inp.get("pattern", "?"), short(inp.get("path", "")))
    if name == "Glob":
        return "glob %s :: %s" % (inp.get("pattern", "?"), short(inp.get("path", "")))
    if name == "Bash":
        cmd = short(re.sub(r"\s+", " ", inp.get("command", "?")).strip())
        cmd = re.sub(r"^git -C \S+ ", "git ", cmd)
        return cmd
    return name + ":" + json.dumps(inp)[:120]


def bucket(name, key, text):
    k = key.lower()
    if name == "Bash":
        if "vitest" in k or "lint:boundaries" in k or "typecheck" in k or "npm test" in k or "pnpm test" in k or "client test" in k or "reviewer-core test" in k:
            return "d test/lint output"
        m = re.search(r"git show \S+?:(\S+)", k)
        if m:  # file read at a ref -> classify by path
            return bucket("Read", m.group(1), None)
        if re.search(r"\bgit (diff|blame)\b", k) or "diff -rq" in k or "diff --no-index" in k or k.startswith("diff "):
            return "a diff"
        return "f other"
    # Read/Grep/Glob
    if re.search(r"\.(test|it\.test|spec)\.tsx?$", k) or "/tests/" in k or "/test/" in k or "__tests__" in k:
        return "c test files"
    if re.search(r"\.(md|mdx)$", k) or "decisions/" in k or "/docs/" in k or "/specs/" in k or "/skills/" in k or "/rules/" in k or "insights" in k or "agent-prompts" in k or "/prompts/" in k:
        return "e docs/ADR/skill/rule"
    if any(s in k for s in ("server/src", "reviewer-core/src", "client/src", "server/drizzle", "server/src/db")):
        return "b source (server/reviewer-core/client src)"
    if "hunks/" in k or k.endswith(".patch") or k.endswith("diff.patch") or k.endswith("stat.txt") or k.endswith("index.txt"):
        return "a diff"
    return "f other"


def load(path):
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def content_len(c):
    if isinstance(c, str):
        return len(c)
    if isinstance(c, list):
        n = 0
        for b in c:
            if isinstance(b, dict):
                if b.get("type") == "text":
                    n += len(b.get("text", ""))
                else:
                    n += len(json.dumps(b))
            else:
                n += len(str(b))
        return n
    return len(json.dumps(c)) if c is not None else 0


def profile(label, path):
    rows = load(path)
    print("=" * 100)
    print(label, "|", len(rows), "entries")
    types = Counter(r.get("type") for r in rows)
    print("entry types:", dict(types))

    # attachments
    att = Counter()
    att_chars = Counter()
    for r in rows:
        if r.get("type") == "attachment":
            a = r.get("attachment", {})
            t = a.get("type")
            att[t] += 1
            att_chars[t] += len(json.dumps(a)) + len(str(r.get("rendered", "")))
    print("attachments:", {k: (att[k], att_chars[k]) for k in att})

    # tool uses and results
    uses = {}  # id -> (name, input, key)
    order = []
    results = []  # (id, name, key, chars, is_error)
    first_user = None
    meta_user_chars = 0
    last_assistant_text = ""
    handback = ""
    thinking_chars = 0
    timeline = []  # per request: (ctx_tokens, result_chars_since_prev, attach_chars_since_prev, tool_input_chars)
    pend_res = pend_att = pend_in = 0
    text_chars = 0
    usage_by_req = {}
    seen_req = set()
    for r in rows:
        if r.get("type") == "attachment":
            pend_att += len(json.dumps(r.get("attachment", {})))
        m = r.get("message")
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        if role == "assistant":
            rid = r.get("requestId") or r.get("uuid")
            if "usage" in m:
                u = m["usage"]
                if rid not in seen_req:
                    seen_req.add(rid)
                    ctx = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
                    timeline.append([ctx, pend_res, pend_att, pend_in, u.get("output_tokens", 0)])
                    pend_res = pend_att = pend_in = 0
                else:
                    timeline[-1][4] = u.get("output_tokens", 0)
        c = m.get("content")
        if role == "user":
            if first_user is None and isinstance(c, str):
                first_user = c
            if r.get("isMeta"):
                meta_user_chars += content_len(c)
            if isinstance(c, list):
                for b in c:
                    if isinstance(b, dict) and b.get("type") == "tool_result":
                        tid = b.get("tool_use_id")
                        name, inp, key = uses.get(tid, ("?", {}, "?"))
                        ch = content_len(b.get("content"))
                        pend_res += ch
                        results.append((tid, name, key, ch, bool(b.get("is_error"))))
        elif role == "assistant":
            rid = r.get("requestId") or r.get("uuid")
            if "usage" in m:
                usage_by_req[rid] = m["usage"]
            if isinstance(c, list):
                for b in c:
                    if not isinstance(b, dict):
                        continue
                    bt = b.get("type")
                    if bt == "tool_use":
                        name = b.get("name")
                        inp = b.get("input", {})
                        key = key_of(name, inp)
                        uses[b.get("id")] = (name, inp, key)
                        pend_in += len(json.dumps(inp))
                        order.append((b.get("id"), name, key))
                        if name == "SubagentHandback":
                            handback = inp.get("message", "")
                    elif bt == "thinking":
                        thinking_chars += len(b.get("thinking", ""))
                    elif bt == "text":
                        text_chars += len(b.get("text", ""))
                        last_assistant_text = b.get("text", "") or last_assistant_text

    print("\n-- prompt / report sizes (chars, /4 ≈ tokens)")
    print("  initial prompt (first user msg): %d chars ≈ %d tok" % (len(first_user or ""), len(first_user or "") // 4))
    print("  meta user msgs (skill/system injections): %d chars ≈ %d tok" % (meta_user_chars, meta_user_chars // 4))
    print("  assistant thinking total: %d chars ≈ %d tok" % (thinking_chars, thinking_chars // 4))
    print("  assistant text total: %d chars ≈ %d tok" % (text_chars, text_chars // 4))
    print("  final report (SubagentHandback message): %d chars ≈ %d tok" % (len(handback), len(handback) // 4))
    print("  last assistant text block: %d chars" % len(last_assistant_text))

    # usage
    if usage_by_req:
        tot = Counter()
        for u in usage_by_req.values():
            for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"):
                tot[k] += u.get(k, 0)
        n = len(usage_by_req)
        all_in = tot["input_tokens"] + tot["cache_read_input_tokens"] + tot["cache_creation_input_tokens"]
        print("\n-- usage (%d API requests, deduped by requestId)" % n)
        for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"):
            print("  %-28s %10d" % (k, tot[k]))
        print("  total input (all kinds)      %10d" % all_in)
        print("  cache hit ratio (read / all input): %.1f%%" % (100.0 * tot["cache_read_input_tokens"] / max(1, all_in)))
        print("  billed-ish: uncached+creation = %d ; output = %d" % (tot["input_tokens"] + tot["cache_creation_input_tokens"], tot["output_tokens"]))
        # context growth: max cache_read + creation per request ≈ context size at last request
        ctx = [(u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("input_tokens", 0)) for u in usage_by_req.values()]
        print("  context size per request: first=%d, max=%d, last=%d" % (ctx[0], max(ctx), ctx[-1]))
        # attribute growth
        tot_growth = ctx[-1] - ctx[0]
        tr = sum(t[1] for t in timeline); ta = sum(t[2] for t in timeline); ti = sum(t[3] for t in timeline); to = sum(t[4] for t in timeline)
        print("  context growth after 1st request: %d tok; between-request chars: tool_results=%d attachments=%d tool_inputs=%d; output tok=%d"
              % (tot_growth, tr, ta, ti, to))
        print("  implied chars/token over growth: %.2f (results+attachments+inputs)/(growth-output)" % ((tr + ta + ti) / max(1, tot_growth - to)))
        print("  top 8 context jumps (delta tok | result chars | attach chars):")
        prev = ctx[0]
        jumps = []
        for i, t in enumerate(timeline[1:], 1):
            jumps.append((t[0] - prev, t[1], t[2], i)); prev = t[0]
        for d, rc, ac, i in sorted(jumps, reverse=True)[:8]:
            print("    req %2d: +%6d tok | %7d res chars | %6d att chars | prev out %d" % (i, d, rc, ac, timeline[i-1][4]))
        # attachment overhead by type in tokens-ish
        print("  attachments total chars: %d (≈ %d tok at 2.7 c/t if fully injected)" % (ta, int(ta / 2.7)))

    # tool calls by name
    by_name = Counter(name for _, name, _ in order)
    chars_by_name = Counter()
    for _, name, key, ch, err in results:
        chars_by_name[name] += ch
    print("\n-- tool calls by name (count, result chars, ≈tok)")
    for name, cnt in by_name.most_common():
        print("  %-20s %3d  %9d chars ≈ %7d tok" % (name, cnt, chars_by_name[name], chars_by_name[name] // 4))
    total_res = sum(chars_by_name.values())
    print("  %-20s %3d  %9d chars ≈ %7d tok" % ("TOTAL", len(order), total_res, total_res // 4))

    # top 10 results
    print("\n-- 10 largest tool results")
    for tid, name, key, ch, err in sorted(results, key=lambda x: -x[3])[:10]:
        print("  %8d  %-5s %s%s" % (ch, name, key[:110], "  [ERROR]" if err else ""))

    # dedup paths/commands with sizes
    agg = defaultdict(lambda: [0, 0])  # key -> [count, chars]
    for tid, name, key, ch, err in results:
        agg[(name, key)][0] += 1
        agg[(name, key)][1] += ch
    print("\n-- all Read/Grep/Glob paths and Bash commands (dedup; count x chars)")
    for (name, key), (cnt, ch) in sorted(agg.items(), key=lambda kv: -kv[1][1]):
        print("  %-5s %2dx %8d  %s" % (name, cnt, ch, key[:120]))

    print("\n-- re-reads (same key >1 in this transcript)")
    rr = [(k, v) for k, v in agg.items() if v[0] > 1]
    if not rr:
        print("  none")
    for (name, key), (cnt, ch) in sorted(rr, key=lambda kv: -kv[1][1]):
        print("  %-5s %2dx %8d chars  %s" % (name, cnt, ch, key[:110]))

    # denials: tool results that are hook denials cost a full turn each
    denials = sum(1 for _, name, key, ch, err in results if name == "Bash" and err)
    print("\n-- Bash calls that errored (hook denials or failures): %d" % denials)

    # buckets
    bk = Counter()
    bkn = Counter()
    for tid, name, key, ch, err in results:
        b = bucket(name, key, None)
        bk[b] += ch
        bkn[b] += 1
    print("\n-- buckets of tool-result volume")
    for b in sorted(bk):
        print("  %-42s %3d calls %9d chars ≈ %6d tok  %5.1f%%" % (b, bkn[b], bk[b], bk[b] // 4, 100.0 * bk[b] / max(1, total_res)))

    return {"agg": agg, "total": total_res}


def norm(name, key):
    if name in ("Read",):
        return ("Read", key)
    if name == "Bash":
        k = key
        for pat, tag in (
            ("git diff --stat", "git diff --stat"),
            ("git diff", "git diff (file subset)"),
            ("git show", "git show ref:path"),
            ("git log", "git log"),
            ("git blame", "git blame"),
            ("lint:boundaries", "pnpm lint:boundaries"),
            ("route-adapter-calls", "vitest route-adapter-calls"),
            ("vitest", "vitest (unit/it)"),
            ("typecheck", "typecheck"),
            ("diff -rq", "diff -rq vendor/shared"),
        ):
            if pat in k:
                return ("Bash~", tag)
        return ("Bash", key)
    return (name, key)


def overlap(out):
    la, lb = list(out.keys())[:2]
    A, B = out[la]["agg"], out[lb]["agg"]
    na = defaultdict(lambda: [0, 0])
    nb = defaultdict(lambda: [0, 0])
    for src, dst in ((A, na), (B, nb)):
        for (name, key), (cnt, ch) in src.items():
            nk = norm(name, key)
            dst[nk][0] += cnt
            dst[nk][1] += ch

    print("=" * 100)
    print("CROSS-TRANSCRIPT OVERLAP (A=%s, B=%s)" % (la, lb))
    shared = [k for k in na if k in nb]
    print("\n-- files read by both (A count x chars | B count x chars)")
    sa = sb = 0
    for k in sorted(shared, key=lambda k: -(na[k][1] + nb[k][1])):
        if k[0] == "Read":
            print("  A %dx %7d | B %dx %7d  %s" % (na[k][0], na[k][1], nb[k][0], nb[k][1], k[1][:100]))
            sa += na[k][1]
            sb += nb[k][1]
    print("  shared Read total: A %d chars, B %d chars" % (sa, sb))
    print("\n-- commands run by both (normalised family)")
    ca = cb = 0
    for k in sorted(shared, key=lambda k: -(na[k][1] + nb[k][1])):
        if k[0] != "Read":
            print("  A %dx %7d | B %dx %7d  %s" % (na[k][0], na[k][1], nb[k][0], nb[k][1], k[1][:100]))
            ca += na[k][1]
            cb += nb[k][1]
    print("  shared cmd total: A %d chars, B %d chars" % (ca, cb))
    print("\n-- only-A Reads: %d files; only-B Reads: %d files" % (
        sum(1 for k in na if k[0] == "Read" and k not in nb), sum(1 for k in nb if k[0] == "Read" and k not in na)))


def main(argv):
    files = parse_args(argv)
    out = {}
    for label, path in files.items():
        out[label] = profile(label, path)
    if len(out) >= 2:
        overlap(out)


if __name__ == "__main__":
    main(sys.argv[1:])
