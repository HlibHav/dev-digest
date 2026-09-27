import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import messages from "../../../../messages/en/prReview.json";
import shellMessages from "../../../../messages/en/shell.json";
import { RoleGroup } from "./RoleGroup";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const FILES: PrFile[] = [
  { path: "a.ts", additions: 1, deletions: 0, patch: null },
  { path: "b.ts", additions: 2, deletions: 1, patch: null },
];

describe("RoleGroup", () => {
  it("renders the label, hint and file count", () => {
    renderWithIntl(
      <RoleGroup role="core" label="Core" hint="Business logic" files={FILES} findingsCount={0} />,
    );
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Business logic")).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
  });

  it("shows the findings dot count only when findingsCount > 0", () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, shell: shellMessages }}>
        <RoleGroup role="core" label="Core" hint="Business logic" files={FILES} findingsCount={0} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("2")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, shell: shellMessages }}>
        <RoleGroup role="core" label="Core" hint="Business logic" files={FILES} findingsCount={2} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("starts open for core, collapsed for docs and boilerplate", () => {
    renderWithIntl(
      <RoleGroup role="core" label="Core" hint="h" files={FILES} findingsCount={0} />,
    );
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    cleanup();

    renderWithIntl(
      <RoleGroup role="docs" label="Docs" hint="h" files={FILES} findingsCount={0} />,
    );
    expect(screen.queryByText("a.ts")).not.toBeInTheDocument();
    cleanup();

    renderWithIntl(
      <RoleGroup role="boilerplate" label="Boilerplate" hint="h" files={FILES} findingsCount={0} />,
    );
    expect(screen.queryByText("a.ts")).not.toBeInTheDocument();
  });
});
