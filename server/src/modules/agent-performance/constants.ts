/** A row (or the headline) with fewer decisions than this is flagged `small_sample`. */
export const SMALL_SAMPLE_THRESHOLD = 10;

/** Longest custom range, counted in inclusive days (`to − from + 1`). */
export const MAX_CUSTOM_RANGE_DAYS = 366;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Rolling presets, in hours back from the request instant. */
export const PRESET_HOURS = { '1d': 24, '30d': 720 } as const;

export const DEFAULT_PERIOD = '30d';

/** Severities broken out in `findings_by_severity`; any other value only counts toward totals. */
export const KNOWN_SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;

/** Statuses broken out in `runs_by_status`; a null or other status only counts toward `runs`. */
export const KNOWN_STATUSES = ['running', 'done', 'failed', 'cancelled'] as const;
