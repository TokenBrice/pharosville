// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HarborLedgerPanel } from "./harbor-ledger-panel";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { makerSquadFixtureInputs } from "../__fixtures__/pharosville-world";

afterEach(() => {
  cleanup();
});

function panelWorld() {
  return buildPharosVilleWorld(makerSquadFixtureInputs());
}

describe("HarborLedgerPanel", () => {
  it("keeps timestamped rare sightings browsable in the visible ledger", () => {
    render(
      <HarborLedgerPanel
        almanacEntries={[{
          id: "2026-08-13:deep-night-meteor",
          message: "A single meteor crossed the deep-night harbor sky.",
          timestampLabel: "01:12",
        }]}
        onClose={() => undefined}
        world={panelWorld()}
      />,
    );
    expect(screen.getByText("01:12")).toBeTruthy();
    expect(screen.getByText(/single meteor crossed/)).toBeTruthy();
  });

  it("uses modal dialog semantics and focuses/restores the close control", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "Open harbor ledger";
    document.body.append(opener);
    opener.focus();

    const view = render(<HarborLedgerPanel onClose={() => undefined} world={panelWorld()} />);

    const panel = screen.getByRole("dialog", { name: "Harbor ledger" });
    const closeButton = screen.getByRole("button", { name: "Close harbor ledger" });
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(closeButton);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  // The ledger is prose. If the scrolling body is not itself a tab stop, the
  // close button is the only focusable thing in the panel, the trap bounces Tab
  // straight back to it, and a keyboard reader can read exactly one screenful
  // of a ledger that lists every ship, dock and grave.
  it("gives the scrolling body a named tab stop so a keyboard reader can scroll the ledger", () => {
    render(<HarborLedgerPanel onClose={() => undefined} world={panelWorld()} />);

    const closeButton = screen.getByRole("button", { name: "Close harbor ledger" });
    const body = screen.getByRole("region", { name: "Harbor ledger contents" });
    expect(body.tabIndex).toBe(0);
    expect(body.contains(screen.getByTestId("pharosville-accessibility-ledger"))).toBe(true);

    // Tab off the close control is left to the browser, which moves focus into
    // the body; the trap only closes the loop at either end.
    expect(fireEvent.keyDown(closeButton, { key: "Tab" })).toBe(true);

    body.focus();
    expect(document.activeElement).toBe(body);
    fireEvent.keyDown(body, { key: "Tab" });
    expect(document.activeElement).toBe(body); // Native Tab movement is a browser assertion.
  });

  it("calls onClose from the close control", () => {
    let closed = 0;
    render(<HarborLedgerPanel onClose={() => { closed += 1; }} world={panelWorld()} />);

    fireEvent.click(screen.getByRole("button", { name: "Close harbor ledger" }));
    expect(closed).toBe(1);
  });

  it("renders the one ledger visibly rather than a second copy of the text", () => {
    render(<HarborLedgerPanel onClose={() => undefined} world={panelWorld()} />);

    const ledgers = screen.getAllByTestId("pharosville-accessibility-ledger");
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]!.className).toBe("pharosville-ledger");
    // Same content the screen-reader path carries, in the same words.
    expect(ledgers[0]!.textContent).toContain("Sailing in formation");
    expect(ledgers[0]!.textContent).toContain("Visual cues");
  });
});
