#!/usr/bin/env python3
"""Extract task line + diff text from a stored `user` message (prompt_assembly.user),
mirroring assemblePrompt's own join order in reviewer-core/src/prompt.ts:
  [task, '## PR description\n<untrusted...>', '## Skills / rules\n...', '## Relevant memory...',
   '## Repo skeleton\n<untrusted...>', '## Project context...', '## Callers...',
   '## Diff to review\n<untrusted source="diff">\n<diff>\n</untrusted>'].join('\n\n')
Task is section 0 (everything before the first '\n\n## '). Diff is inside the last
<untrusted source="diff"> ... </untrusted> block.
"""
import sys, re

def main(path, task_out, diff_out):
    with open(path, 'r', encoding='utf-8') as f:
        user = f.read()
    # task = text before the first "\n\n## " heading
    m = re.search(r'\n\n## ', user)
    task = user[: m.start()] if m else user
    with open(task_out, 'w', encoding='utf-8') as f:
        f.write(task)
    # diff = inside the LAST <untrusted source="diff">...</untrusted>
    dm = re.search(r'## Diff to review\n<untrusted source="diff">\n([\s\S]*)\n</untrusted>\s*$', user)
    if not dm:
        print('DIFF BLOCK NOT FOUND', file=sys.stderr)
        sys.exit(1)
    diff = dm.group(1)
    with open(diff_out, 'w', encoding='utf-8') as f:
        f.write(diff)
    print(f'task chars={len(task)} diff chars={len(diff)}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
