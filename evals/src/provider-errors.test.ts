/**
 * The CI gate that tells a provider outage from model noise — no model call.
 *   pnpm vitest run src/provider-errors.test.ts
 *
 * Eval cases are report-only in CI, so a run where every session died on an exhausted key still
 * showed green (run 37899637027, attempt 1). These lines are copied from that log.
 */

import { describe, expect, test } from "vitest";
import { findProviderErrors } from "./provider-errors.js";

const CREDITS_PROXY =
  '    text: API Error: 402 litellm.APIError: APIError: OpenrouterException - {"error":{"message":"This request requires more credits, or fewer max_tokens. You requested up to 32000 tokens, but can only afford 15603.';
const CREDITS_DIRECT =
  "     → judge returned no JSON: 402 This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, but can only afford 63379.";
const AUTH = '    text: API Error: 401 {"error":{"message":"User not found.","code":401}}';

describe("findProviderErrors", () => {
  test("flags an exhausted key, through the proxy and direct", () => {
    expect(findProviderErrors(CREDITS_PROXY)).toEqual([{ kind: "credits", line: CREDITS_PROXY.trim() }]);
    expect(findProviderErrors(CREDITS_DIRECT)).toHaveLength(1);
  });

  test("flags a rejected key", () => {
    expect(findProviderErrors(AUTH)).toEqual([{ kind: "auth", line: AUTH.trim() }]);
  });

  test("leaves model noise alone: failed cases, timeouts, a 402 inside a timestamp", () => {
    const noise = [
      "2026-10-09T07:33:58.4029221Z http.https://github.com/.extraheader",
      "   × workflow:review > server task: follows server/AGENTS.md to TESTING.md 24399ms",
      "Error: Claude Code returned an error result: Reached maximum number of turns (4)",
      "Error: Test timed out in 240000ms.",
      "| 1 | major | verified | onion-architecture step 3 | `run.ts:402` |",
    ].join("\n");
    expect(findProviderErrors(noise)).toEqual([]);
  });

  test("reports each distinct line once", () => {
    expect(findProviderErrors([CREDITS_PROXY, CREDITS_PROXY].join("\n"))).toHaveLength(1);
  });
});
