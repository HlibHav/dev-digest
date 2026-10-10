/**
 * The tool sandbox of an eval session — no model call.
 *   pnpm vitest run src/runtime/run-claude.test.ts
 *
 * The SDK's `allowedTools` only auto-approves; under bypassPermissions every built-in tool stays
 * available. A workflow session once used Write to put a made-up insight into the real repo.
 * `tools` is the option that removes everything else from the session.
 */

import { describe, expect, test } from "vitest";
import { buildOptions } from "./run-claude.js";

describe("buildOptions", () => {
  // A restricted set without ToolSearch dies with "Prompt is too long" on the first tool result.
  test("the allow-list plus ToolSearch is the session's whole tool set", () => {
    const options = buildOptions({ allowedTools: ["Read", "Grep", "Glob", "Bash"] });
    expect(options.tools).toEqual(["Read", "Grep", "Glob", "Bash", "ToolSearch"]);
    expect(options.allowedTools).toEqual(["Read", "Grep", "Glob", "Bash"]);
  });

  test("nothing that writes gets in", () => {
    const options = buildOptions({ allowedTools: ["Read", "Grep", "Glob", "Skill"] });
    expect(options.tools).not.toContain("Write");
    expect(options.tools).not.toContain("Edit");
  });

  test("a content-only run gets no tools at all", () => {
    const options = buildOptions({});
    expect(options.tools).toEqual([]);
    expect(options.systemPrompt).toContain("You have NO tools");
  });
});
