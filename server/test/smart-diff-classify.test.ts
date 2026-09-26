import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/smart-diff/classify.js';

/**
 * path → role table. Order is the point: a lock file inside a nested test
 * folder must still land in `boilerplate` (snapshot rule ranks above tests),
 * and `.claude/**` must rank above `docs` even for a markdown file.
 */
describe('classifyFile', () => {
  it.each<[string, string]>([
    // the three contentious cases the brief calls out explicitly
    ['src/__tests__/__snapshots__/x.snap', 'boilerplate'],
    ['.claude/skills/security/SKILL.md', 'wiring'],
    ['e2e/README.md', 'tests'],
    // pinned cases from the brief
    ['pnpm-lock.yaml', 'boilerplate'],
    ['server/pnpm-lock.yaml', 'boilerplate'],
    ['client/src/lib/hooks/index.ts', 'wiring'],
    ['server/src/modules/reviews/service.ts', 'core'],
    ['server/test/reviews.it.test.ts', 'tests'],
    ['server/INSIGHTS.md', 'docs'],
    ['.github/workflows/ci.yml', 'wiring'],
    ['client/next.config.ts', 'wiring'],
    ['dist/bundle.js', 'boilerplate'],
    ['src/foo.generated.ts', 'boilerplate'],
    // pins the leading-`**/` glob-anchoring fix: a naive `**` → `.*`
    // translation would send this root-level file to `core` instead of `docs`
    // (it would require a slash before the filename).
    ['CONTRIBUTING.md', 'docs'],
    // deliberate deviation from the plain course rule set (brief.md): any
    // `package.json` is configuration, not business logic, so it must not
    // fall into `core` next to the module it configures.
    ['server/package.json', 'wiring'],
  ])('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});
