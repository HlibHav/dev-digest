import { z } from 'zod';
import { RiskSeverity } from '@devdigest/shared';

/**
 * What the model is asked to return. Deliberately permissive: no caps, no
 * lengths, no cross-checks, optional fields `.nullish()`. Code validates and
 * trims the answer (`normalizeAnswer`) and the strict stored `PrBrief` is the
 * contract, so a long summary or a seventh risk never costs a paid call.
 */
export const PrBriefModelAnswer = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      explanation: z.string(),
      severity: RiskSeverity,
      file_refs: z.array(z.string()),
      line_refs: z
        .array(z.object({ file: z.string(), start_line: z.number().int(), end_line: z.number().int() }))
        .nullish(),
    }),
  ),
  review_focus: z.array(z.object({ file: z.string(), line: z.number().int(), reason: z.string() })),
});
export type PrBriefModelAnswer = z.infer<typeof PrBriefModelAnswer>;
