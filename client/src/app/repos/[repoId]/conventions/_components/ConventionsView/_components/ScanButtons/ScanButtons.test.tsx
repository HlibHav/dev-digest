import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { ScanButtons } from "./ScanButtons";

afterEach(cleanup);

function renderButtons(props: Partial<React.ComponentProps<typeof ScanButtons>> = {}) {
  const onScan = props.onScan ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ScanButtons hasScanned={false} busy={false} {...props} onScan={onScan} />
    </NextIntlClientProvider>,
  );
  return {
    onScan,
    run: screen.getByRole("button", { name: /run scan/i }),
    rescan: screen.getByRole("button", { name: /re-scan/i }),
  };
}

describe("ScanButtons", () => {
  it("shows Run Scan and Re-scan as two buttons, with only Run Scan live before the first scan", () => {
    const { run, rescan } = renderButtons({ hasScanned: false });
    expect(run).not.toBe(rescan);
    expect(run).toBeEnabled();
    expect(rescan).toBeDisabled();
  });

  it("switches to Re-scan once a scan exists", () => {
    const { run, rescan } = renderButtons({ hasScanned: true });
    expect(run).toBeDisabled();
    expect(rescan).toBeEnabled();
  });

  it("disables both while a scan is running", () => {
    const { run, rescan } = renderButtons({ hasScanned: true, busy: true });
    expect(run).toBeDisabled();
    expect(rescan).toBeDisabled();
  });

  it("starts a scan from either button", () => {
    const first = renderButtons({ hasScanned: false });
    fireEvent.click(first.run);
    expect(first.onScan).toHaveBeenCalledTimes(1);
    cleanup();

    const again = renderButtons({ hasScanned: true });
    fireEvent.click(again.rescan);
    expect(again.onScan).toHaveBeenCalledTimes(1);
  });
});
