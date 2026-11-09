// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as coin from "./coin-readings/CoinReadings";
import * as reports from "./harbour-report/HarbourReports";
import * as actions from "./panel-actions/PanelActions";
import { StoreContext } from "./hooks";
import { SidePanel } from "./Panel";
import { panelFixture } from "./__fixtures__/store";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(["boat", "harbourmaster"])("mounts %s slots in panel order", (kind) => {
  const f = panelFixture();
  const slots = [vi.spyOn(coin, "CoinReadings"), vi.spyOn(reports, "HarbourReports"), vi.spyOn(actions, "PanelActions"), vi.spyOn(actions, "PanelOutbound")];
  f.store.select(kind === "boat" ? { kind: "boat", id: f.model.boats[0].id } : { kind: "landmark", id: "harbourmaster" }, { fly: false });
  const ui = render(<StoreContext.Provider value={f.store}><SidePanel onClose={() => {}} /></StoreContext.Provider>);
  try {
    for (const slot of [slots[kind === "boat" ? 0 : 1], ...slots.slice(2)]) {
      expect(slot).toHaveBeenCalled();
      if (slot !== slots[0]) expect(slot.mock.results.every((result) => result.value === null)).toBe(true);
    }
    if (kind === "boat") {
      expect(slots[0].mock.calls[0][0]).toEqual({ id: f.model.boats[0].id, model: f.model });
      const details = Array.from(ui.container.querySelectorAll<HTMLDetailsElement>(".hb-panel-body > details"));
      expect(details.map((el) => el.querySelector("summary")?.textContent)).toEqual(["Depeg history", "Backing", "Liquidity", "How this appears in the harbour"]);
      expect(details.every((el) => !el.open)).toBe(true);
    }
    expect(ui.container.querySelector("aside")!.firstElementChild).toBe(ui.container.querySelector(".hb-close"));
    expect(Array.from(ui.container.querySelector(".hb-panel-record")!.children).map((el) => el.tagName)).toEqual(kind === "boat" ? ["HEADER", "DIV", "BUTTON", "DETAILS"] : ["HEADER", "DIV"]);
  } finally { ui.unmount(); f.dispose(); }
});
