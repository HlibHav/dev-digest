/** Pure helpers for the cost breakdown lists. */

const cents = (usd: number) => Math.round(usd * 100);

/** True when the parts, each rounded to cents, do not add up to the total rounded to cents. */
export function roundedSumDiffers(parts: readonly (number | null)[], total: number | null): boolean {
  if (total === null) return false;
  const sum = parts.reduce<number>((acc, p) => acc + (p === null ? 0 : cents(p)), 0);
  return sum !== cents(total);
}

/** A CSS conic-gradient for a decorative donut of the priced parts, or null when nothing is priced. */
export function donutGradient(values: readonly (number | null)[], colors: readonly string[]): string | null {
  const priced = values.map((v) => (v !== null && v > 0 ? v : 0));
  const total = priced.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let start = 0;
  const stops = priced.map((v, i) => {
    const end = start + (v / total) * 100;
    const stop = `${colors[i % colors.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(", ")})`;
}
