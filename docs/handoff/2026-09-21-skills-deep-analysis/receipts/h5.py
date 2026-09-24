"""H5 probe: the byte-identical all-five prompt from run c7f0a9cb, sent straight to
OpenRouter, first unpinned (sticky routing?), then pinned to each provider.

Mirrors reviewer-core/src/llm/openrouter.ts:69 (model, messages, temperature 0,
json_schema strict, usage.include) and adds only `provider` for the pinned arm.
Writes nothing to the dev DB.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = json.load(open(os.path.expanduser('~/.devdigest/secrets.json')))['OPENROUTER_API_KEY']
PROMPT = json.load(open(os.path.join(HERE, 'prompt.json')))
SCHEMA = json.load(open(os.path.join(HERE, 'review_schema.json')))
ENDPOINTS = json.load(open(os.path.join(HERE, 'endpoints.json')))['data']['endpoints']
OUT = os.path.join(HERE, 'h5_results.jsonl')
MODEL = 'deepseek/deepseek-v4-flash'


def body(provider_tag: str | None, prompt: dict | None = None) -> dict:
    prompt = prompt or PROMPT
    b = {
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': prompt['system']},
            {'role': 'user', 'content': prompt['user']},
        ],
        'temperature': 0,
        'response_format': {
            'type': 'json_schema',
            'json_schema': {'name': 'Review', 'schema': SCHEMA, 'strict': True},
        },
        'usage': {'include': True},
    }
    if provider_tag:
        b['provider'] = {'order': [provider_tag], 'allow_fallbacks': False}
    return b


def parse_review(content: str) -> dict:
    m = re.search(r'\{.*\}', content or '', re.S)
    if not m:
        return {'parse': 'no-json'}
    try:
        d = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        return {'parse': f'bad-json: {e.msg}'}
    findings = d.get('findings') or []
    sev = [str(f.get('severity', '?')).lower() for f in findings]
    return {
        'verdict': d.get('verdict'),
        'score': d.get('score'),
        'n_findings': len(findings),
        'n_critical': sev.count('critical'),
        'titles': [str(f.get('title', ''))[:90] for f in findings],
        'summary': str(d.get('summary', ''))[:220],
    }


def call(arm: str, provider_tag: str | None, prompt: dict | None = None) -> dict:
    req = urllib.request.Request(
        'https://openrouter.ai/api/v1/chat/completions',
        data=json.dumps(body(provider_tag, prompt)).encode(),
        headers={'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'},
    )
    t0 = time.time()
    rec: dict = {'arm': arm, 'pinned': provider_tag}
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        rec.update(error=f'HTTP {e.code}: {e.read().decode(errors="replace")[:300]}')
        res = None
    except Exception as e:  # noqa: BLE001 — record any transport failure as data
        rec.update(error=f'{type(e).__name__}: {e}')
        res = None
    rec['secs'] = round(time.time() - t0, 1)
    if res is not None:
        if res.get('error'):
            rec['error'] = str(res['error'])[:300]
        ch = (res.get('choices') or [{}])[0]
        msg = ch.get('message') or {}
        content = msg.get('content') or ''
        usage = res.get('usage') or {}
        rec.update(
            served_by=res.get('provider'),
            gen_id=res.get('id'),
            prompt_tokens=usage.get('prompt_tokens'),
            completion_tokens=usage.get('completion_tokens'),
            reasoning_tokens=(usage.get('completion_tokens_details') or {}).get('reasoning_tokens'),
            cost=usage.get('cost'),
            content_chars=len(content),
            reasoning_chars=len(msg.get('reasoning') or ''),
            finish=ch.get('finish_reason'),
            **parse_review(content),
        )
    with open(OUT, 'a') as f:
        f.write(json.dumps(rec) + '\n')
    return rec


def line(r: dict) -> str:
    if r.get('error') and not r.get('verdict'):
        return f"{r['arm']:<24} {str(r.get('pinned')):<18} ERROR {r['error'][:140]}"
    return (
        f"{r['arm']:<24} {str(r.get('pinned')):<18} served={str(r.get('served_by')):<13} "
        f"in={r.get('prompt_tokens')} out={r.get('completion_tokens')} reas={r.get('reasoning_tokens')} "
        f"chars={r.get('content_chars')} {r.get('secs')}s -> {r.get('verdict')} "
        f"score={r.get('score')} crit={r.get('n_critical')} n={r.get('n_findings')}"
    )


if __name__ == '__main__':
    step = sys.argv[1]
    if step == 'unpinned':
        for i in range(int(sys.argv[2]) if len(sys.argv) > 2 else 4):
            print(line(call(f'unpinned-{i + 1}', None)), flush=True)
    elif step == 'pinned':
        tags = [e['tag'] for e in ENDPOINTS]
        with ThreadPoolExecutor(max_workers=5) as ex:
            for r in ex.map(lambda t: call(f'pinned:{t}', t), tags):
                print(line(r), flush=True)
    elif step == 'matrix':
        # matrix <provider tag> <n> <prompt name>...  → prompt_<name>.json, interleaved
        tag, n, names = sys.argv[2], int(sys.argv[3]), sys.argv[4:]
        prompts = {nm: json.load(open(os.path.join(HERE, f'prompt_{nm}.json'))) for nm in names}
        jobs = [(nm, i) for i in range(n) for nm in names]
        with ThreadPoolExecutor(max_workers=3) as ex:
            for r in ex.map(lambda j: call(f'{tag}|{j[0]}#{j[1] + 1}', tag, prompts[j[0]]), jobs):
                print(line(r), flush=True)
