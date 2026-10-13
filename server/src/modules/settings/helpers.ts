import type { Settings } from '@devdigest/shared';

/** A persisted settings key/value row (non-secret prefs). */
export interface SettingsRow {
  key: string;
  value: unknown;
}

/**
 * Collapse key/value setting rows into a flat `Settings` object.
 * Rows whose value is null or undefined are skipped, so a cleared setting
 * falls back to its default instead of overriding it with an empty value.
 */
export function rowsToSettings(rows: SettingsRow[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    if (r.value === null || r.value === undefined) continue;
    out[r.key] = r.value;
  }
  return out as Settings;
}
