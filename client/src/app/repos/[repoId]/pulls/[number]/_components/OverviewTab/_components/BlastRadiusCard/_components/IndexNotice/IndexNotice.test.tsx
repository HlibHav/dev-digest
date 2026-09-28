import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastDegradedReason } from "@devdigest/shared";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { IndexNotice } from "./IndexNotice";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      timeZone="UTC"
      messages={{ blast: messages }}
      onError={(e) => {
        throw e;
      }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

const REASON_TEXT: Record<BlastDegradedReason, string> = {
  no_data: "No code index for this repo yet, so callers come from a text search or are missing.",
  index_partial: "The code index stopped early, so some callers may be missing.",
  index_failed: "The last indexing run failed, so callers may be missing.",
  repo_too_large: "The repo is too large to index fully, so callers may be missing.",
  flag_off: "Code indexing is turned off on this server.",
};

describe("IndexNotice — reason text", () => {
  it("shows the reason text for each reason", () => {
    for (const reason of Object.keys(REASON_TEXT) as BlastDegradedReason[]) {
      renderWithIntl(<IndexNotice reason={reason} />);
      expect(screen.getByText("Incomplete index")).toBeInTheDocument();
      expect(screen.getByText(REASON_TEXT[reason])).toBeInTheDocument();
      cleanup();
    }
  });
});

describe("IndexNotice — resync", () => {
  it("Resync calls onResync, disables while pending, shows queued", () => {
    const onResync = vi.fn();
    const { rerender } = render(
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={{ blast: messages }}
        onError={(e) => {
          throw e;
        }}
      >
        <IndexNotice reason="no_data" resync={{ onResync, pending: false, queued: false }} />
      </NextIntlClientProvider>,
    );

    const button = screen.getByRole("button", { name: "Resync index" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onResync).toHaveBeenCalledTimes(1);

    rerender(
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={{ blast: messages }}
        onError={(e) => {
          throw e;
        }}
      >
        <IndexNotice reason="no_data" resync={{ onResync, pending: true, queued: false }} />
      </NextIntlClientProvider>,
    );
    // A second click while pending must not queue another call — the button is disabled.
    const pendingButton = screen.getByRole("button", { name: "Resyncing…" });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(onResync).toHaveBeenCalledTimes(1);

    rerender(
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={{ blast: messages }}
        onError={(e) => {
          throw e;
        }}
      >
        <IndexNotice reason="no_data" resync={{ onResync, pending: false, queued: true }} />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText("Resync queued. Reload in a minute to see the new map."),
    ).toBeInTheDocument();
  });
});
