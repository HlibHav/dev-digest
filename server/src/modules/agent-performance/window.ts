import { StatsQuery } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { DAY_MS, DEFAULT_PERIOD, HOUR_MS, MAX_CUSTOM_RANGE_DAYS, PRESET_HOURS } from './constants.js';
import type { WindowBounds } from './types.js';

/** One fixed error for every bad period: no details, so request text never echoes back. */
function invalidPeriod(): AppError {
  return new AppError('invalid_period', 'Invalid period', 400);
}

/** `YYYY-MM-DD` → its 00:00 UTC instant, or null when the date does not exist (2026-02-30). */
function utcMidnight(date: string): Date | null {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null;
  return d;
}

/**
 * Resolve a stats/dashboard query into window bounds against the request instant.
 *   1d / 30d → (now − 24h|720h, now]   (from/to ignored)
 *   custom   → [from 00:00Z, to + 1 day 00:00Z)
 * Throws `AppError('invalid_period', 400)` before any query runs.
 */
export function resolveWindow(query: unknown, now: Date): WindowBounds {
  const raw = typeof query === 'object' && query !== null ? (query as Record<string, unknown>) : {};
  const kind = StatsQuery.shape.period.safeParse(raw.period);
  if (!kind.success) throw invalidPeriod();
  const period = kind.data ?? DEFAULT_PERIOD;

  if (period !== 'custom') {
    return {
      period,
      start: new Date(now.getTime() - PRESET_HOURS[period] * HOUR_MS),
      end: now,
      startInclusive: false,
      endInclusive: true,
    };
  }

  const parsed = StatsQuery.safeParse(raw);
  if (!parsed.success) throw invalidPeriod();
  const { from, to } = parsed.data;
  if (from === undefined || to === undefined) throw invalidPeriod();
  const start = utcMidnight(from);
  const last = utcMidnight(to);
  if (!start || !last) throw invalidPeriod();
  const today = utcMidnight(now.toISOString().slice(0, 10))!;
  const days = (last.getTime() - start.getTime()) / DAY_MS + 1;
  if (start > last || last > today || days > MAX_CUSTOM_RANGE_DAYS) throw invalidPeriod();

  return {
    period,
    start,
    end: new Date(last.getTime() + DAY_MS),
    startInclusive: true,
    endInclusive: false,
  };
}
