// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PHAROSVILLE_CONTROL_GROUPS } from "../content/pharosville-controls";
import { ControlsCheatsheet } from "./controls-cheatsheet";

afterEach(cleanup);

describe("ControlsCheatsheet", () => {
  it("renders accessible static panel content from structured controls", () => {
    const { container } = render(<ControlsCheatsheet />);
    const region = screen.getByRole("region", { name: "World Controls Cheatsheet" });

    expect(region.getAttribute("aria-describedby")).toBe("pharosville-controls-cheatsheet-title-intro");
    expect(screen.getByText(/inspect the harbor/i)).toBeTruthy();
    for (const group of PHAROSVILLE_CONTROL_GROUPS) {
      expect(within(region).getByRole("heading", { name: group.title })).toBeTruthy();
    }
    expect(within(region).getByText("Focus next map target")).toBeTruthy();
    expect(within(region).getByText("Mouse wheel")).toBeTruthy();
    expect(within(region).getByText("Auto day-night cycle")).toBeTruthy();
    expect(container.querySelector("button, canvas, img, svg")).toBeNull();
  });

  it("renders keyboard tokens as kbd elements", () => {
    const { container } = render(<ControlsCheatsheet />);
    const tokens = Array.from(container.querySelectorAll("kbd")).map((kbd) => kbd.textContent);

    expect(tokens).toContain("Tab");
    expect(tokens).toContain("Shift");
    expect(tokens).toContain("Enter");
    expect(tokens).toContain("+");
    expect(tokens).toContain("_");
  });

  it("accepts custom panel ids and filtered control groups for later wiring", () => {
    render(
      <ControlsCheatsheet
        headingId="custom-controls-title"
        controls={PHAROSVILLE_CONTROL_GROUPS.filter((group) => group.id === "panels")}
      />,
    );

    const region = screen.getByRole("region", { name: "World Controls Cheatsheet" });
    expect(region.getAttribute("aria-describedby")).toBe("custom-controls-title-intro");
    expect(screen.getByRole("heading", { name: "Panels" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Camera" })).toBeNull();
  });
});
