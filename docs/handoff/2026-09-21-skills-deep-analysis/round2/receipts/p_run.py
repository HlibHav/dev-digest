"""Round-2 follow-up P: F2 without the description's license sentence (both arms, the two
providers where all-five missed), plus R1 (repo-conventions alone) on Parasail."""
import json, os
from concurrent.futures import ThreadPoolExecutor
import h5, r_run  # r_run patches h5.parse_review to keep full findings

HERE = os.path.dirname(os.path.abspath(__file__))
h5.OUT = os.path.join(HERE, 'P_results.jsonl')
LICENSE = (" Kept it\nas a plain `fetch` since the response is a file blob, not JSON, so it doesn't\n"
           "go through the usual typed hooks.")

prompts = {}
for n in ('all5', 'noskills'):
    p = json.load(open(os.path.join(HERE, f'prompt_F_F2_{n}.json')))
    assert p['user'].count(LICENSE) == 1, n
    q = {'system': p['system'], 'user': p['user'].replace(LICENSE, '')}
    assert len(p['user']) - len(q['user']) == len(LICENSE)
    prompts[f'P_{n}_nolicense'] = q
    json.dump(q, open(os.path.join(HERE, f'prompt_P_{n}_nolicense.json'), 'w'))
prompts['R1_rc_alone'] = json.load(open(os.path.join(HERE, 'prompt_R_R1_rc_alone.json')))

if __name__ == '__main__':
    jobs = []
    for k in range(6):
        for prov in ('deepinfra/fp8', 'open-inference/fp8'):
            for arm in ('P_all5_nolicense', 'P_noskills_nolicense'):
                jobs.append((arm, prov, k))
        jobs.append(('R1_rc_alone', 'parasail/fp8', k))
    with ThreadPoolExecutor(max_workers=3) as ex:
        for r in ex.map(lambda j: h5.call(f'{j[1]}|{j[0]}#{j[2] + 1}', j[1], prompts[j[0]]), jobs):
            print(h5.line(r), flush=True)
