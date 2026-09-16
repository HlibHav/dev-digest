/**
 * USD cost of an agent run for display. Missing data (null / absent / NaN)
 * reads "—" so it never looks like a free run; a real 0 stays "$0.00".
 * `decimals` is 3 on compact surfaces ("$0.014") and 4 where the run is shown
 * in detail ("$0.0013"). Trailing zeros are trimmed down to cents ("$0.06").
 */
export function formatCost(usd: number | null | undefined, decimals: 3 | 4): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  const floor = 10 ** -decimals;
  if (usd > 0 && usd < floor) return `<$${floor.toFixed(decimals)}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  const [whole, frac = ""] = usd.toFixed(decimals).split(".");
  return `$${whole}.${frac.replace(/0+$/, "").padEnd(2, "0")}`;
}
