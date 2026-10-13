import { z } from 'zod';

/** `GET /eval-suite-runs/compare?base=&head=`: both ids are suite-run uuids. */
export const CompareQuery = z.object({
  base: z.string().uuid(),
  head: z.string().uuid(),
});
export type CompareQuery = z.infer<typeof CompareQuery>;

export const OkResponse = z.object({ ok: z.literal(true) });

/**
 * Byte cap for the case-write requests. The case diff is limited to 64 KB by
 * the service (AC-8); the rest of the body (PR text, expectations, notes) fits
 * in the headroom, and anything larger is refused before it is parsed.
 */
export const CASE_WRITE_BODY_LIMIT = 256 * 1024;
