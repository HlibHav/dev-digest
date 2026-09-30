import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { BlastGraph } from "./BlastGraph";

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

describe("BlastGraph — nodes", () => {
  it("renders an svg with symbol, caller and endpoint nodes", () => {
    const blast: BlastRadius = {
      changed_symbols: [{ name: "foo", file: "a.ts", kind: "function" }],
      downstream: [
        {
          symbol: "foo",
          callers: [{ name: "foo", file: "b.ts", line: 10 }],
          endpoints_affected: ["GET /x"],
          crons_affected: [],
        },
      ],
      summary: "",
    };
    renderWithIntl(<BlastGraph blast={blast} />);

    const svg = screen.getByLabelText("Blast radius graph");
    expect(svg.tagName.toLowerCase()).toBe("svg");

    expect(within(svg).getByText("foo")).toBeInTheDocument();
    expect(within(svg).getByText("b.ts:10")).toBeInTheDocument();
    expect(within(svg).getByText("GET /x")).toBeInTheDocument();
  });
});

describe("BlastGraph — empty", () => {
  it("empty graph text", () => {
    const blast: BlastRadius = {
      changed_symbols: [{ name: "foo", file: "a.ts", kind: "function" }],
      downstream: [],
      summary: "",
    };
    renderWithIntl(<BlastGraph blast={blast} />);

    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Blast radius graph")).not.toBeInTheDocument();
  });
});
