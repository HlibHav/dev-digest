import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/settings.json";
import { SettingsModels } from "./SettingsModels";

vi.mock("../../../../../../../lib/hooks", () => ({
  useSettings: () => ({ data: { feature_models: {} } }),
  useUpdateSettings: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useProviderModels: () => ({ data: [] }),
}));

afterEach(cleanup);

describe("SettingsModels", () => {
  it("empty workspace shows Risk Brief with openai/gpt-4.1-mini", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
        <SettingsModels />
      </NextIntlClientProvider>,
    );
    const label = screen.getByText("Risk Brief");
    // label -> flex header -> the FormField wrapper holding the picker
    const row = label.parentElement!.parentElement!;
    expect(within(row).getByText("openai/gpt-4.1-mini")).toBeInTheDocument();
    expect(within(row).queryByText("gpt-4.1")).not.toBeInTheDocument();
  });
});
