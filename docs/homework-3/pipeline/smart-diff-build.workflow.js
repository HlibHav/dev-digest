export const meta = {
  name: 'smart-diff-build',
  description: 'implementer (sonnet) executes the Smart Diff plan, then architecture-reviewer ∥ plan-verifier; up to two fix rounds',
  phases: [
    { title: 'Implement', detail: 'implementer executes the Development Plan (continuations if partial)' },
    { title: 'Review', detail: 'architecture-reviewer ∥ plan-verifier on the uncommitted tree' },
    { title: 'Fix', detail: 'implementer addresses verified findings and gaps' },
    { title: 'Re-verify', detail: 'both reviewers again on the fixed tree' },
  ],
}

const SCRATCH = '/private/tmp/claude-503/-Users-Glebazzz-Claude-PROJECTS-NEO-dev-digest--claude-worktrees-notebooklm-connection-setup-12e635/11447393-41a4-4d8a-9671-23345f243fad/scratchpad'
const REPO = '/Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/notebooklm-connection-setup-12e635'
const PLAN = `${SCRATCH}/smart-diff-plan.md`
const BRIEF = `${SCRATCH}/smart-diff-brief.md`
const ROLE_IMPL = `${SCRATCH}/role-implementer.md`
const ROLE_ARCH = `${SCRATCH}/role-architecture-reviewer.md`
const ROLE_VERIFY = `${SCRATCH}/role-plan-verifier.md`

const EXTRA_STEP = `
## Additional required step (added by the caller, treat it as plan step 12)
12. [BE] server — integration test for the route, \`server/test/smart-diff.it.test.ts\` (new).
   Copy the fixture shape of \`server/test/reviews.it.test.ts\` (\`startPg\`/\`dockerAvailable\` from
   \`./helpers/pg.js\`, \`buildApp\`, \`loadConfig\`, \`seed\`, \`app.inject\`, and its
   \`setupRepoAndPr\`-style inserts into \`t.repos\`, \`t.pullRequests\`, \`t.prFiles\`). Seed one PR
   with five files (a \`pnpm-lock.yaml\`, a \`server/src/modules/x/service.ts\`, a
   \`server/test/x.test.ts\`, a \`server/src/modules/x/index.ts\`, a \`docs/x.md\`), insert one row
   into \`t.reviews\` and two into \`t.findings\` (both on the core file, start_line 11 and 11 → one
   unique line; plus one on the lock file) directly through the db handle. Assert:
   \`GET /pulls/:id/smart-diff\` → 200; \`SmartDiff.parse(body)\` succeeds; group roles come back in
   the order core, tests, wiring, docs, boilerplate; the lock file is in \`boilerplate\`;
   \`finding_lines\` of the core file is \`[11]\`; \`split_suggestion.total_lines\` equals the sum;
   an unknown PR id → 404. You WRITE this test; running it (Docker) belongs to plan-verifier.
   Skip the \`describe\` when Docker is unavailable exactly as \`reviews.it.test.ts\` does.
`

const CALLER_NOTES = `
## Caller notes (read before starting)
- The brief has one addition since the plan was written: \`package.json\` (any depth) → \`wiring\`
  (see the brief, "Classification rules" section). Add it to the wiring patterns and pin
  \`server/package.json\` → \`wiring\` in the classifier test table.
- Work in the worktree at ${REPO} only. Node: prefix Bash with
  \`export PATH=/opt/homebrew/opt/node/bin:$PATH;\`. Batch independent shell work into one Bash call.
- For client component tests, first look at how \`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx\`
  and \`client/src/test/setup.ts\` provide next-intl messages, and copy that pattern.
- Do not commit. Do not write any INSIGHTS.md. Do not touch .claude/**.
`

function implPrompt(round, prev) {
  const cont = prev
    ? `\nThis is CONTINUATION run #${round}. Your previous report is at ${prev}. Read it, then \`git status --short\` and \`git diff --stat\`, and continue from the first step that is not done. Don't redo finished steps.\n`
    : ''
  return `Read your role definition first: ${ROLE_IMPL} (follow it exactly).
Then read the brief ${BRIEF} and the Development Plan ${PLAN} in full.
${cont}${CALLER_NOTES}${EXTRA_STEP}
Write your Implementation Report to ${SCRATCH}/impl-report-${round}.md and return it as your final text. The report MUST contain a line \`Status: done\`, \`Status: partial\` or \`Status: blocked\`.`
}

function archPrompt(round) {
  return `Read your role definition first: ${ROLE_ARCH} (follow it exactly).
Target: the uncommitted changes in the worktree ${REPO} (vs HEAD, which is \`main\`). The plan they implement is at ${PLAN}; the brief is at ${BRIEF}. The implementer's report (with its "Handoff to reviewers" section) is at ${SCRATCH}/impl-report-latest.md — read it for the list of touched files.
Write your Architecture Review to ${SCRATCH}/arch-review-${round}.md and return it as your final text. It MUST contain a line \`Verdict: pass\` or \`Verdict: fail\`.`
}

function verifyPrompt(round) {
  return `Read your role definition first: ${ROLE_VERIFY} (follow it exactly).
Plan: ${PLAN} (plus one extra step the caller added, reproduced here — verify it as S12):${EXTRA_STEP}
Brief (context only): ${BRIEF}. Implementer's report: ${SCRATCH}/impl-report-latest.md (its Tests table lists commands it ran; they are NOT "checks already run" for you because you cannot confirm the tree state — run the checks yourself).
Target: the uncommitted changes in the worktree ${REPO} vs HEAD. No API server is running; verify through tests and code reading. Docker is running, so run the integration suite once (\`cd server && pnpm exec vitest run .it.test\`; it takes a few minutes — set a long Bash timeout).
Write your Plan Verification to ${SCRATCH}/plan-verify-${round}.md and return it as your final text. It MUST contain a line \`Overall: verified\` or \`Overall: gaps\`.`
}

function fixPrompt(round) {
  return `Read your role definition first: ${ROLE_IMPL} (follow it exactly).
This is FIX round #${round} on the Smart Diff implementation in ${REPO} (uncommitted changes vs HEAD). Read the brief ${BRIEF}, the plan ${PLAN}, your previous report ${SCRATCH}/impl-report-latest.md, the Architecture Review ${SCRATCH}/arch-review-latest.md and the Plan Verification ${SCRATCH}/plan-verify-latest.md.
${CALLER_NOTES}${EXTRA_STEP}
Address: every architecture finding marked verified (major or critical; minor placement findings too when cheap), every plan item with verdict \`not met\`, every \`partial\` whose missing part is code (not "browser: main session"), and every "Unmapped changes" hunk (either map it to a plan step by making it necessary, or remove it). Do not argue with a finding in prose — fix it, or, if the reviewer is factually wrong (quote the path:line that proves it), record that under Deviations and leave the code. Then re-run your Step 4 checks.
Write your report to ${SCRATCH}/impl-report-fix-${round}.md and return it as your final text, with a \`Status:\` line.`
}

const status = (text) => (String(text ?? '').match(/Status:\s*(done|partial|blocked)/i)?.[1] ?? 'unknown').toLowerCase()

// ---- Implement -------------------------------------------------------------
phase('Implement')
let report = await agent(implPrompt(1, null), { label: 'implementer', phase: 'Implement', model: 'sonnet', effort: 'high' })
let st = status(report)
let round = 1
while (st === 'partial' && round < 3) {
  round++
  log(`implementer returned partial — continuation run #${round}`)
  report = await agent(implPrompt(round, `${SCRATCH}/impl-report-${round - 1}.md`), { label: `implementer (cont ${round})`, phase: 'Implement', model: 'sonnet', effort: 'high' })
  st = status(report)
}
if (st === 'blocked' || st === 'unknown') {
  log(`implementer stopped with status=${st}; skipping review`)
  return { status: st, implRounds: round, report }
}
// copy the latest report to a stable name for the reviewers (an agent does it — scripts have no fs)
await agent(`Copy the file ${SCRATCH}/impl-report-${round}.md to ${SCRATCH}/impl-report-latest.md using one Bash \`cp\` command. Return "ok".`, { label: 'copy report', phase: 'Implement', model: 'haiku', effort: 'low' })

// ---- Review ----------------------------------------------------------------
phase('Review')
let [arch, verify] = await parallel([
  () => agent(archPrompt(1), { label: 'architecture-reviewer', phase: 'Review', model: 'sonnet', effort: 'high' }),
  () => agent(verifyPrompt(1), { label: 'plan-verifier', phase: 'Review', model: 'sonnet', effort: 'high' }),
])
const verdict = (t) => (String(t ?? '').match(/Verdict:\s*(pass|fail)/i)?.[1] ?? 'unknown').toLowerCase()
const overall = (t) => (String(t ?? '').match(/Overall:\s*(verified|gaps)/i)?.[1] ?? 'unknown').toLowerCase()
let v = verdict(arch), o = overall(verify)
log(`review round 1: architecture=${v}, plan=${o}`)

let fixRound = 0
const history = [{ round: 1, architecture: v, plan: o }]
while ((v !== 'pass' || o !== 'verified') && fixRound < 2) {
  fixRound++
  await agent(`Using one Bash command, copy ${SCRATCH}/arch-review-${fixRound}.md to ${SCRATCH}/arch-review-latest.md and ${SCRATCH}/plan-verify-${fixRound}.md to ${SCRATCH}/plan-verify-latest.md. Return "ok".`, { label: 'copy reviews', phase: 'Fix', model: 'haiku', effort: 'low' })
  phase('Fix')
  const fix = await agent(fixPrompt(fixRound), { label: `implementer (fix ${fixRound})`, phase: 'Fix', model: 'sonnet', effort: 'high' })
  await agent(`Using one Bash command, copy ${SCRATCH}/impl-report-fix-${fixRound}.md to ${SCRATCH}/impl-report-latest.md. Return "ok".`, { label: 'copy fix report', phase: 'Fix', model: 'haiku', effort: 'low' })
  if (status(fix) === 'blocked') { log('fix round blocked'); history.push({ round: fixRound + 1, fix: 'blocked' }); break }
  phase('Re-verify')
  ;[arch, verify] = await parallel([
    () => agent(archPrompt(fixRound + 1), { label: `architecture-reviewer (r${fixRound + 1})`, phase: 'Re-verify', model: 'sonnet', effort: 'high' }),
    () => agent(verifyPrompt(fixRound + 1), { label: `plan-verifier (r${fixRound + 1})`, phase: 'Re-verify', model: 'sonnet', effort: 'high' }),
  ])
  v = verdict(arch); o = overall(verify)
  history.push({ round: fixRound + 1, architecture: v, plan: o })
  log(`review round ${fixRound + 1}: architecture=${v}, plan=${o}`)
}

return { status: st, implRounds: round, fixRounds: fixRound, architecture: v, plan: o, history, lastArchReview: arch, lastPlanVerification: verify }