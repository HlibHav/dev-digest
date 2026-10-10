import type {
  EvalAgentSnapshot,
  EvalConfigChange,
  EvalMetricDeltas,
  EvalPromptDiffLine,
  EvalScoredCase,
  EvalSuiteRunSummary,
} from '@devdigest/shared';

/** Line-level LCS diff. Never truncates; the table is O(n*m) for typical prompt sizes. */
export function lineDiff(oldText: string, newText: string): EvalPromptDiffLine[] {
  const a = oldText === '' ? [] : oldText.split('\n');
  const b = newText === '' ? [] : newText.split('\n');
  const n = a.length;
  const m = b.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: EvalPromptDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'equal', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: 'remove', text: a[i++]! });
    } else {
      out.push({ op: 'add', text: b[j++]! });
    }
  }
  while (i < n) out.push({ op: 'remove', text: a[i++]! });
  while (j < m) out.push({ op: 'add', text: b[j++]! });
  return out;
}

export function configChanges(base: EvalAgentSnapshot, head: EvalAgentSnapshot): EvalConfigChange[] {
  const out: EvalConfigChange[] = [];
  if (base.model !== head.model) out.push({ kind: 'model', name: null, from: base.model, to: head.model });
  if (base.provider !== head.provider) {
    out.push({ kind: 'provider', name: null, from: base.provider, to: head.provider });
  }
  if (base.strategy !== head.strategy) {
    out.push({ kind: 'strategy', name: null, from: base.strategy, to: head.strategy });
  }
  const baseSkills = new Map(base.skills.map((s) => [s.id, s]));
  const headSkills = new Map(head.skills.map((s) => [s.id, s]));
  for (const s of head.skills) {
    const before = baseSkills.get(s.id);
    if (!before) out.push({ kind: 'skill_added', name: s.name, from: null, to: String(s.version) });
    else if (before.version !== s.version) {
      out.push({ kind: 'skill_version', name: s.name, from: String(before.version), to: String(s.version) });
    }
  }
  for (const s of base.skills) {
    if (!headSkills.has(s.id)) out.push({ kind: 'skill_removed', name: s.name, from: String(s.version), to: null });
  }
  return out;
}

export function caseSetChange(base: EvalScoredCase[], head: EvalScoredCase[]): { added: number; removed: number } {
  const baseIds = new Set(base.map((c) => c.case_id));
  const headIds = new Set(head.map((c) => c.case_id));
  let added = 0;
  let removed = 0;
  for (const id of headIds) if (!baseIds.has(id)) added += 1;
  for (const id of baseIds) if (!headIds.has(id)) removed += 1;
  return { added, removed };
}

function delta(base: number | null, head: number | null): number | null {
  return base === null || head === null ? null : head - base;
}

/** Signed head-minus-base deltas; null when either side is null. */
export function metricDeltas(base: EvalSuiteRunSummary, head: EvalSuiteRunSummary): EvalMetricDeltas {
  return {
    recall: delta(base.recall, head.recall),
    precision: delta(base.precision, head.precision),
    citation_accuracy: delta(base.citation_accuracy, head.citation_accuracy),
    cost_usd: delta(base.cost_usd, head.cost_usd),
  };
}
