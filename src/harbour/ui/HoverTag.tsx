import { useLayoutEffect, useRef } from "react";
import { boatFact, harbourFact, landmarkFact, LAUNCH_HOVER, wreckFact } from "./facts";
import { deadSummaries, FAMILIES } from "../model/obituary";
import { placeName } from "./places";
import { expectedLabel, PHASE_NAME, yardCoins } from "./yard";
import { useFrame, useFrameWrite, usePresence, useStore, useSticky, useUI } from "./hooks";
import { getFeed, getLayout, sameHit, type PickHit, type ScreenPoint } from "./services";
import { setStyle, useMeasurements } from "./measurements";
import type { OfficeState } from "../readings/bind";

/**
 * The chart-paper tag: name + one fact, hung from a brass leader at the object's anchor. Follows the
 * object every engine frame (no lag). Hover shows it; selection pins it.
 */
export function HoverTag() {
  const { hover, selected, tick } = useUI();
  void tick; // re-render each second: a boat's whereabouts change as it sails
  const shownHit = hover ?? selected;
  const [mounted, shown] = usePresence(shownHit != null, 160);
  const hit = useSticky(shownHit);
  if (!mounted || !hit) return null;
  return <Tag hit={hit} shown={shown && shownHit != null} pinned={sameHit(hit, selected)} />;
}

function Tag({ hit, shown, pinned }: { hit: PickHit; shown: boolean; pinned: boolean }) {
  const store = useStore();
  const { model } = useUI();
  const ref = useRef<HTMLDivElement>(null);
  const pt = useRef<ScreenPoint>({ x: 0, y: 0, visible: false });
  const measurements = useMeasurements();
  const placement = useRef({ visible: false, below: false, anchor: "", tag: "" });

  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const p = store.picking.screenPosition(hit, pt.current);
    const next = placement.current;
    next.visible = !!p?.visible;
    if (!p?.visible) return;
    next.below = p.y < 64;
    // Read the cached tag dimensions before ANY overlay writes in this engine frame.
    const tag = el.firstElementChild as HTMLElement | null;
    const half = measurements.get(tag).w / 2, maxX = innerWidth - 12;
    const shift = Math.min(0, maxX - (p.x + half)) + Math.max(0, 12 - (p.x - half));
    next.tag = `translateX(calc(-50% + ${shift.toFixed(1)}px))`;
    next.anchor = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
  });

  useFrameWrite(() => {
    const el = ref.current, next = placement.current;
    if (!el) return;
    setStyle(el, "visibility", next.visible ? "" : "hidden");
    if (!next.visible) return;
    const below = String(next.below);
    if (el.dataset.below !== below) el.dataset.below = below;
    const tag = el.firstElementChild as HTMLElement | null;
    if (tag) setStyle(tag, "transform", next.tag);
    setStyle(el, "transform", next.anchor);
  });

  let name = "", fact = "", decorative = false, swatch: string | null = null;
  if (hit.kind === "boat") {
    const b = store.boat(hit.id);
    if (b) {
      name = b.symbol;
      const w = store.whereaboutsOf(b.id);
      fact = boatFact(b, w).slice(b.symbol.length + 3);
      // a coin launched during this visit sails dressed overall for her first circuit (fleet/bunting.ts)
      if (!b.maiden && (store.ctx.services.get("bunting") as { isDressed?(id: string): boolean } | undefined)?.isDressed?.(b.id)) fact += ` · ${LAUNCH_HOVER}`;
      swatch = b.brandColor;
      decorative = w.kind === "outing";
    }
  } else if (hit.kind === "wreck") {
    const r = deadSummaries().get(hit.id);
    if (r) {
      name = r.symbol;
      fact = wreckFact(r.id);
      swatch = FAMILIES[r.family].ink;
    }
  } else if (hit.kind === "yard") {
    const c = yardCoins(store.ctx).find((y) => y.id === hit.id);
    if (c) {
      name = c.symbol;
      fact = `on the slips · ${c.phase ? PHASE_NAME[c.phase].toLowerCase() : "phase not stated"}${c.expected ? ` · ${expectedLabel(c.expected)}` : ""}`;
    }
  } else if (hit.kind === "landmark") {
    name = placeName(getLayout(store.ctx), hit.id);
    const f = landmarkFact(hit.id, model, store.underWay(), {
      yard: hit.id === "slipway" ? yardCoins(store.ctx).length : undefined,
      roads: hit.id === "the-roads" ? store.boatsInZone("the-roads")?.length : undefined,
    });
    fact = f.fact; decorative = !!f.decorative;
  } else {
    name = `${hit.id} harbour`;
    // T6: the office's month (readings.offices; the 30-day figure from the same /api/chains row the panel prints)
    const office = (store.ctx.services.get("readings") as { offices?: Readonly<Record<string, OfficeState>> } | undefined)?.offices?.[hit.id];
    const row = (getFeed(store.ctx)?.payloads.chains?.data?.chains ?? []).find((c) => c.name === hit.id);
    fact = harbourFact(hit.id, model, office, row?.change30dPct);
  }
  useLayoutEffect(() => {
    measurements.invalidate(ref.current?.firstElementChild as HTMLElement | null);
  }, [measurements, name, fact, swatch]);
  if (!name) return null;

  return (
    <div ref={ref} className="hb-tag-anchor hb-fade" data-shown={shown} data-pinned={pinned} aria-hidden="true">
      <div className="hb-tag hb-paper">
        {swatch && <span className="hb-tag-swatch" style={{ background: swatch }} />}
        <span className="hb-tag-name">{name}</span>
        {fact && <span className={`hb-tag-fact hb-num${decorative ? " decorative" : ""}`}>{fact}</span>}
      </div>
      <span className="hb-tag-leader" />
      <span className="hb-tag-pin" />
    </div>
  );
}
