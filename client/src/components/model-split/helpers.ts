/** Pure display formatters shared by the dashboard, the Stats tab and the model split. */

/** A 0..1 ratio as a whole percent ("82%"); null reads "—", never "0%". */
export function formatPercent(r: number | null): string {
  if (r == null || !Number.isFinite(r)) return "—";
  return `${Math.round(r * 100)}%`;
}

/** Milliseconds as "6.2s", "5s" or "2m 5s"; null reads "—", never "0s". */
export function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const sec = ms / 1000;
  if (sec < 60) return `${Number(sec.toFixed(1))}s`;
  const whole = Math.round(sec);
  return `${Math.floor(whole / 60)}m ${whole % 60}s`;
}
