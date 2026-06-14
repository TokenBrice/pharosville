// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangelogPanel } from "./changelog-panel";

afterEach(() => {
  cleanup();
});

describe("ChangelogPanel", () => {
  it("uses modal dialog semantics and focuses/restores the close control", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "Open changelog";
    document.body.append(opener);
    opener.focus();

    const view = render(<ChangelogPanel onClose={() => undefined} />);

    const panel = screen.getByRole("dialog", { name: "Changelog" });
    const closeButton = screen.getByRole("button", { name: "Close changelog" });
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeButton);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
