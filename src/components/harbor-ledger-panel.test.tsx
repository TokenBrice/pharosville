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

    // The close control is the panel's only focusable element, so Tab in
    // either direction stays on it rather than escaping to the world behind.
    fireEvent.keyDown(closeButton, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeButton);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
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
