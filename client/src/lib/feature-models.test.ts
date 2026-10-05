import { describe, it, expect } from "vitest";
import { FEATURE_MODELS as VENDORED } from "@devdigest/shared/contracts/platform";
import { FEATURE_MODELS } from "./feature-models";

describe("risk_brief default (AC-7)", () => {
  it("client list and vendored platform copy both default risk_brief to openrouter/openai/gpt-4.1-mini", () => {
    for (const list of [FEATURE_MODELS, VENDORED]) {
      const f = list.find((x) => x.id === "risk_brief");
      expect([f?.defaultProvider, f?.defaultModel]).toEqual(["openrouter", "openai/gpt-4.1-mini"]);
    }
  });
});
