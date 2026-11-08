import { useState } from "react";
import { createRoot } from "react-dom/client";
import { HarbourUI } from "../../src/harbour/ui/App";
import { StoreContext } from "../../src/harbour/ui/hooks";
import type { HarbourUIStore, UIState } from "../../src/harbour/ui/store";
import { ensureMotionService } from "../../src/harbour/ui/services";
import type { EngineContext } from "../../src/harbour/engine/types";
import type { PickHit } from "../../src/harbour/ui/services";
import type { SoundController, SoundMode } from "../../src/harbour/audio/controller";
import { HarbourFeed } from "../../src/harbour/data/fetch";
import { buildHarbourModel } from "../../src/harbour/model/build";
import { ArrivalModuleFailure } from "../../src/components/arrival-shell";
import { SectionErrorBoundary } from "../../src/components/section-error-boundary";
import "../../src/harbour/ui/harbour-ui.css";
import "../../src/harbour/app/harbour-app.css";

/** Test-only store protocol: real overlays/feed/model, no renderer or production fault switch. */
export async function mountOverlayHarness(element: HTMLElement) {
  const feed = new HarbourFeed({ setTimer: () => 0, clearTimer: () => {} });
  await feed.start();
  const listeners = new Set<() => void>(), soundListeners = new Set<() => void>();
  let state: UIState = { model: buildHarbourModel(feed.payloads, Date.now()), hover: null, shipChoices: [], selected: null, searchOpen: false, ledgerOpen: false, chartMode: false, reducedMotion: true, tick: 0, follow: null, announce: "", capturing: false, watch: null };
  const set = (patch: Partial<UIState>) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()); };
  let mode: SoundMode = "off";
  let postcardFailure = false;
  const postcards = new Set<() => void>();
  const sound: SoundController = {
    get mode() { return mode; }, get on() { return mode !== "off"; }, get playing() { return false; },
    setMode(next) { mode = next; soundListeners.forEach((fn) => fn()); },
    toggle() { sound.setMode(mode === "off" ? "ambient" : "off"); },
    subscribe(fn) { soundListeners.add(fn); return () => { soundListeners.delete(fn); }; },
    cue() {}, stop() {}, dispose() {},
  };
  const services = new Map<string, unknown>([["feed", feed], ["sound", sound]]);
  const ctx = { services, timeOfDay: { hour: 12 } } as unknown as EngineContext;
  const motion = ensureMotionService(ctx);
  motion.setStill(true);
  const store = {
    ctx, motion,
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    set,
    select(selected: PickHit | null) { set({ selected, searchOpen: false }); },
    boat: (id: string) => state.model?.boats.find((b) => b.id === id),
    whereaboutsOf: () => ({ kind: "unknown", place: null }), boatsInZone: () => [], underWay: () => 0,
    onFrame: () => () => {}, onFrameWrite: () => () => {},
    onPostcard(fn: () => void) { postcards.add(fn); return () => { postcards.delete(fn); }; },
    async captureFrame() {
      if (postcardFailure) throw new Error("Test postcard failure");
      const frame = document.createElement("canvas"); frame.width = 320; frame.height = 180; return frame;
    },
    holdHover() {},
    noteInput() {}, dismissHover: () => false, stopAutomation() {}, stopWatch() {}, goHome() {}, keyPan() {}, keyZoom() {}, stepHull() {}, toggleFollow() {}, requestPostcard() { postcards.forEach((fn) => fn()); }, toggleWatch() {}, setFollow(follow: string | null) { set({ follow }); },
  } as unknown as HarbourUIStore;
  let showRecovery: (value: boolean) => void = () => {};
  let fail: () => void = () => {};
  function Fault({ active }: { active: boolean }) { if (active) throw new Error("Test overlay fault"); return null; }
  function Harness() {
    const [recovery, setRecovery] = useState(false), [fault, setFault] = useState(false);
    showRecovery = setRecovery; fail = () => setFault(true);
    return <StoreContext.Provider value={store}>
      {recovery ? <ArrivalModuleFailure /> : <SectionErrorBoundary name="Overlay" supportingText="Reload to try the harbour again."><Fault active={fault} /><HarbourUI /></SectionErrorBoundary>}
    </StoreContext.Provider>;
  }
  const root = createRoot(element);
  root.render(<Harness />);
  return {
    store,
    recovery: (active: boolean) => showRecovery(active),
    postcardFailure: (active: boolean) => { postcardFailure = active; },
    fail: () => fail(),
    async refresh() { await Promise.all(["stablecoins", "chains", "stability", "pegSummary", "stress", "safetyGrades", "mintBurn"].map((key) => feed.refresh(key as Parameters<typeof feed.refresh>[0]))); set({ model: buildHarbourModel(feed.payloads, Date.now()), tick: state.tick + 1 }); },
    dispose() { root.unmount(); motion.dispose(); feed.stop(); },
  };
}
