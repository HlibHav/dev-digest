/**
 * The outcome a record stores — eval:repeat and eval:benchmark read it, not vitest's verdict.
 *   pnpm vitest run src/records/record.test.ts
 *
 * Activation, dispatch and contrast cases have no judge, so the outcome fell back to "the session
 * did not error": a skill that activated before max-turns recorded FAIL while vitest passed it,
 * and a negative case that wrongly activated would have recorded PASS.
 */

import { describe, expect, test } from "vitest";
import { computeOutcome } from "./record.js";

const ok = { isError: false } as const;
const errored = { isError: true } as const;

describe("computeOutcome", () => {
  test("an explicit pass/fail from the case wins over the session error flag", () => {
    expect(computeOutcome({ result: errored, passed: true })).toBe(true);
    expect(computeOutcome({ result: ok, passed: false })).toBe(false);
  });

  test("a judged case uses its threshold, and failed grounding fails it", () => {
    const verdict = { score: 0.8 };
    expect(computeOutcome({ result: ok, verdict, threshold: 0.7 })).toBe(true);
    expect(computeOutcome({ result: ok, verdict, threshold: 0.9 })).toBe(false);
    expect(computeOutcome({ result: ok, verdict, threshold: 0.7, grounded: 0.5 })).toBe(false);
  });

  test("with nothing else to go on, a session that errored fails", () => {
    expect(computeOutcome({ result: ok })).toBe(true);
    expect(computeOutcome({ result: errored })).toBe(false);
  });
});
