/**
 * Provider failures in an eval log — an exhausted or rejected key, not a model that answered
 * badly. CI keeps eval cases report-only (model noise is not a broken PR), so without this check
 * a run where every session died on a 402 still shows green. Matches the provider's phrasing,
 * never a bare status code: a timestamp or a `path:402` carries the digits too.
 */

export interface ProviderError {
  kind: "credits" | "auth";
  line: string;
}

const PATTERNS: { kind: ProviderError["kind"]; re: RegExp }[] = [
  { kind: "credits", re: /requires more credits|exceed your available credits|insufficient credits/i },
  { kind: "auth", re: /API Error: 40[13]\b|invalid api key|No auth credentials|User not found/i },
];

export function findProviderErrors(log: string): ProviderError[] {
  const seen = new Set<string>();
  const found: ProviderError[] = [];
  for (const raw of log.split("\n")) {
    const line = raw.trim();
    const hit = PATTERNS.find((p) => p.re.test(line));
    if (!hit || seen.has(line)) continue;
    seen.add(line);
    found.push({ kind: hit.kind, line });
  }
  return found;
}
