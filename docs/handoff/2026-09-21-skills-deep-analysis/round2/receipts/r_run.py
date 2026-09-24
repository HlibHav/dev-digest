"""Round-2 follow-up on candidate F2: is the with-skills miss on DeepInfra/OpenInference
caused by competition with the other four skills (R1) or by the terse rendering of the
extracted rule (R2)? Splices only the skills block of prompt_F_F2_all5.json."""
import json, os, re, sys
from concurrent.futures import ThreadPoolExecutor
import h5

HERE = os.path.dirname(os.path.abspath(__file__))
h5.OUT = os.path.join(HERE, 'R_results.jsonl')

_orig_parse = h5.parse_review
def parse_full(content):
    out = _orig_parse(content)
    m = re.search(r'\{.*\}', content or '', re.S)
    try:
        d = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        d = {}
    out['findings_full'] = [
        {k: f.get(k) for k in ('severity', 'title', 'file', 'start_line', 'end_line')}
        | {'rationale': str(f.get('rationale', ''))[:300]}
        for f in (d.get('findings') or [])
    ]
    return out
h5.parse_review = parse_full

base = json.load(open(os.path.join(HERE, 'prompt_F_F2_all5.json')))
u = base['user']
head = '## Skills / rules\n'
i = u.index(head) + len(head)
rc = u.index('### repo-conventions\n')
end = [m.start() for m in re.finditer(r'\n\n## (?!api\b)', u) if m.start() > rc][0]
rc_body = u[rc + len('### repo-conventions\n'):end]

SHARP = """# Repo conventions — HlibHav/dev-digest

Rules extracted from this repository and approved by a maintainer. A rule applies to
every file in the diff, not only to the file its evidence comes from. Flag each change
that breaks one, cite the rule, and point at the evidence line that shows how the repo
does it today.

## api

### Return undefined for HTTP 204 No Content responses in API fetch wrapper
- Flag: new or changed code that handles this case another way.
- How the repo does it: `client/src/lib/api.ts:61`
- Severity: warning

### Normalize every API error into ApiError with status, code and details
- Flag: new or changed code that handles this case another way.
- How the repo does it: `client/src/lib/api.ts:50`
- Severity: warning"""

def with_block(block):
    return {'system': base['system'], 'user': u[:i] + block + u[end:]}

prompts = {
    'R1_rc_alone': with_block('### repo-conventions\n' + rc_body),
    'R2_all5_sharp': {'system': base['system'], 'user': u[:rc] + '### repo-conventions\n' + SHARP + u[end:]},
}
# construction check: splicing the original body back must reproduce the original bytes
assert u[:rc] + '### repo-conventions\n' + rc_body + u[end:] == u
for k, p in prompts.items():
    json.dump(p, open(os.path.join(HERE, f'prompt_R_{k}.json'), 'w'))

if __name__ == '__main__':
    jobs = []
    for n in range(6):
        for prov in ('deepinfra/fp8', 'open-inference/fp8'):
            for arm in ('R1_rc_alone', 'R2_all5_sharp'):
                jobs.append((arm, prov, n))
    for n in range(3):
        jobs.append(('R2_all5_sharp', 'parasail/fp8', n))
    with ThreadPoolExecutor(max_workers=3) as ex:
        for r in ex.map(lambda j: h5.call(f'{j[1]}|{j[0]}#{j[2] + 1}', j[1], prompts[j[0]]), jobs):
            print(h5.line(r), flush=True)
