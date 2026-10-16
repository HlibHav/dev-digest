/** Pure helpers for the stats period selector: URL ⇄ selection ⇄ API query. */
import type { StatsQuery } from "@devdigest/shared";

/** What the user picked. A custom range may be half-filled while it is being typed. */
export type PeriodSelection =
  | { period: "1d" }
  | { period: "30d" }
  | { period: "custom"; from: string | null; to: string | null };

/** Longest custom range, counted inclusively (`to − from + 1`), as the server enforces. */
export const MAX_RANGE_DAYS = 366;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Epoch ms of a real `YYYY-MM-DD` calendar date at 00:00 UTC, or null (rejects 2026-02-31). */
function utcDay(value: string): number | null {
  if (!ISO_DATE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return null;
  return ms;
}

function dateOrNull(value: string | null): string | null {
  return value !== null && utcDay(value) !== null ? value : null;
}

/** Today's UTC calendar date (`YYYY-MM-DD`) for a clock reading. */
export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The selection named by the address. Anything missing or unknown reads as 30 days. */
export function readPeriod(sp: URLSearchParams): PeriodSelection {
  const period = sp.get("period");
  if (period === "1d") return { period: "1d" };
  if (period === "custom") return { period: "custom", from: dateOrNull(sp.get("from")), to: dateOrNull(sp.get("to")) };
  return { period: "30d" };
}

/** A copy of `sp` with the selection written in; every other param (e.g. `tab`) is kept. */
export function writePeriod(sp: URLSearchParams, sel: PeriodSelection): URLSearchParams {
  const out = new URLSearchParams(sp);
  out.delete("period");
  out.delete("from");
  out.delete("to");
  out.set("period", sel.period);
  if (sel.period === "custom") {
    if (sel.from) out.set("from", sel.from);
    if (sel.to) out.set("to", sel.to);
  }
  return out;
}

/** The API query for a selection, or null while a custom range is incomplete or invalid. */
export function toStatsQuery(sel: PeriodSelection, todayUtc: string): StatsQuery | null {
  if (sel.period !== "custom") return { period: sel.period };
  if (!sel.from || !sel.to) return null;
  const from = utcDay(sel.from);
  const to = utcDay(sel.to);
  const today = utcDay(todayUtc);
  if (from === null || to === null || today === null) return null;
  if (from > to || to > today) return null;
  if ((to - from) / DAY_MS + 1 > MAX_RANGE_DAYS) return null;
  return { period: "custom", from: sel.from, to: sel.to };
}

/** True when both custom dates are filled in but the range cannot be requested. */
export function isInvalidRange(sel: PeriodSelection, query: StatsQuery | null): boolean {
  return sel.period === "custom" && !!sel.from && !!sel.to && query === null;
}
