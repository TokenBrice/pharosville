// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { reportClientError } from "../error-reporter";
import { SectionErrorBoundary } from "./section-error-boundary";
vi.mock("../error-reporter", () => ({ reportClientError: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("reports a caught component failure once and provides keyboard recovery", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never { throw new Error("chunk failed"); }
  render(<SectionErrorBoundary name="World" supportingText="Try again."><Broken /></SectionErrorBoundary>);
  expect(reportClientError).toHaveBeenCalledTimes(1);
  expect(reportClientError).toHaveBeenCalledWith("render", { kind: "component-failure", section: "World", message: "chunk failed" }, "World:chunk failed");
  const reload = screen.getByRole("button", { name: "Reload harbor" });
  reload.focus();
  expect(document.activeElement).toBe(reload);
});
