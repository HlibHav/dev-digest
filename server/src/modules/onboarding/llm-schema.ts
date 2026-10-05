import { z } from 'zod';

/**
 * What the model may return. Strict structured output needs every key present,
 * so the optional diagram is `.nullable()`, not `.optional()`. The merge step in
 * `helpers.ts` decides which of these strings are ever stored.
 */
export const OnboardingLlmOutput = z.object({
  overview: z.string(),
  diagram: z.string().nullable(),
  file_reasons: z.array(z.object({ path: z.string(), reason: z.string() })),
  command_notes: z.array(z.object({ command: z.string(), note: z.string() })),
  first_tasks: z.array(z.object({ title: z.string(), path: z.string(), reason: z.string() })),
});
export type OnboardingLlmOutput = z.infer<typeof OnboardingLlmOutput>;
