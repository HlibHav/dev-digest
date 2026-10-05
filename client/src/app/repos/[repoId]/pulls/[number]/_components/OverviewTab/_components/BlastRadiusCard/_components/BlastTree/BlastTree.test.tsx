import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ChangedSymbol, DownstreamImpact } from "@devdigest/shared";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { BlastTree } from "./BlastTree";

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

const ONE_GROUP: DownstreamImpact[] = [
  {
    symbol: "foo",
    callers: [{ name: "foo", file: "b.ts", line: 10 }],
    endpoints_affected: ["GET /x"],
    crons_affected: [],
  },
];

const LINK = { repoFullName: "acme/repo", sha: "abc1234" };

// rev 5.3: BlastTree now also takes changed_symbols (server order, used to
// render callerless entries after the groups that have callers). The
// existing tests above only exercise the "foo" group, so this fixture keeps
// their assertions unchanged.
const CHANGED_SYMBOLS_FOO: ChangedSymbol[] = [{ name: "foo", file: "a.ts", kind: "function" }];

describe("BlastTree — callers and endpoints", () => {
  it("lists callers as file:line and the symbol's endpoints below them", () => {
    const { container } = renderWithIntl(
      <BlastTree downstream={ONE_GROUP} changed_symbols={CHANGED_SYMBOLS_FOO} link={LINK} />,
    );

    expect(screen.getByText("b.ts:10")).toBeInTheDocument();
    expect(screen.getByText("GET /x")).toBeInTheDocument();

    const text = container.textContent ?? "";
    expect(text.indexOf("b.ts:10")).toBeLessThan(text.indexOf("GET /x"));
  });
});

describe("BlastTree — caller link", () => {
  it("caller link points at exactly that line", () => {
    renderWithIntl(<BlastTree downstream={ONE_GROUP} changed_symbols={CHANGED_SYMBOLS_FOO} link={LINK} />);

    const link = screen.getByRole("link", { name: "b.ts:10" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/repo/blob/abc1234/b.ts#L10");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("no link without sha or repo", () => {
    renderWithIntl(<BlastTree downstream={ONE_GROUP} changed_symbols={CHANGED_SYMBOLS_FOO} link={null} />);

    expect(screen.queryByRole("link", { name: "b.ts:10" })).not.toBeInTheDocument();
    expect(screen.getByText("b.ts:10")).toBeInTheDocument();
  });
});

describe("BlastTree — collapse", () => {
  it("symbol header collapses and expands its callers", () => {
    renderWithIntl(<BlastTree downstream={ONE_GROUP} changed_symbols={CHANGED_SYMBOLS_FOO} link={LINK} />);

    const header = screen.getByRole("button", { name: /foo/ });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("b.ts:10")).toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("b.ts:10")).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("b.ts:10")).toBeInTheDocument();
  });
});

describe("BlastTree — crons vs endpoints", () => {
  it("crons render in their own row, apart from endpoints", () => {
    const group: DownstreamImpact[] = [
      {
        symbol: "foo",
        callers: [{ name: "foo", file: "b.ts", line: 10 }],
        endpoints_affected: ["GET /x"],
        crons_affected: ["nightly-job"],
      },
    ];
    const { container } = renderWithIntl(
      <BlastTree downstream={group} changed_symbols={CHANGED_SYMBOLS_FOO} link={LINK} />,
    );

    expect(screen.getByText("GET /x")).toBeInTheDocument();
    expect(screen.getByText("nightly-job")).toBeInTheDocument();

    // Two distinct, sequential rows: the endpoint chip precedes the cron row's
    // own label, and the cron row's label precedes its own chip.
    const text = container.textContent ?? "";
    const endpointIdx = text.indexOf("GET /x");
    const cronsLabelIdx = text.indexOf("cron/jobs");
    const cronIdx = text.indexOf("nightly-job");
    expect(endpointIdx).toBeGreaterThan(-1);
    expect(cronsLabelIdx).toBeGreaterThan(endpointIdx);
    expect(cronIdx).toBeGreaterThan(cronsLabelIdx);
  });
});

describe("BlastTree — changed symbols without callers (rev 5.3)", () => {
  it("lists changed symbols without callers as 'no callers' rows", () => {
    // "rowsToSettings" has a downstream group (one caller); "SettingsRow" is a
    // changed symbol with no group at all. "SettingsRow" also appears twice
    // in changed_symbols (declared in two files) and must render only once.
    const changedSymbols: ChangedSymbol[] = [
      { name: "rowsToSettings", file: "a.ts", kind: "function" },
      { name: "SettingsRow", file: "a.ts", kind: "function" },
      { name: "SettingsRow", file: "b.ts", kind: "function" },
    ];
    const downstream: DownstreamImpact[] = [
      {
        symbol: "rowsToSettings",
        callers: [{ name: "rowsToSettings", file: "b.ts", line: 10 }],
        endpoints_affected: ["GET /x"],
        crons_affected: [],
      },
    ];

    const { container } = renderWithIntl(
      <BlastTree downstream={downstream} changed_symbols={changedSymbols} link={LINK} />,
    );

    // Renders once, even though changed_symbols lists it twice.
    expect(screen.getAllByText("SettingsRow()")).toHaveLength(1);
    // The new blast.json "noCallers" key ("no callers") — stays red until the
    // key exists, same as every other blast test importing the real JSON.
    expect(screen.getByText("no callers")).toBeInTheDocument();

    // No file:line link and no endpoint/cron chip were added for the
    // callerless row: the only link in the whole tree is still the one
    // caller from the "rowsToSettings" group, and its one endpoint chip
    // isn't duplicated onto "SettingsRow".
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getAllByText("GET /x")).toHaveLength(1);

    // Comes after the symbol that has callers.
    const text = container.textContent ?? "";
    expect(text.indexOf("rowsToSettings()")).toBeGreaterThan(-1);
    expect(text.indexOf("SettingsRow()")).toBeGreaterThan(text.indexOf("rowsToSettings()"));
  });
});
