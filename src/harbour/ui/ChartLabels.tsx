import { useMemo, useRef } from "react";
import type { HarbourLayout } from "../layout/types";
import { cullLabels, type LabelBox } from "./cull";
import { useFrame, useFrameWrite, usePresence, useStore, useUISlice } from "./hooks";
import { sameHit, type PickHit, type ScreenPoint } from "./services";
import { setStyle, useMeasurements } from "./measurements";

interface ChartLabel { key: string; text: string; kind: "landmark" | "pier" | "boat"; hit: PickHit }

/** 'C' Chart mode: landmark names, pier names and the top-10 boats, collision-culled in priority order. */
export function ChartLabels() {
  const chartMode = useUISlice((s) => s.chartMode);
  const model = useUISlice((s) => s.model);
  const [mounted, shown] = usePresence(chartMode, 220);
  const store = useStore();
  const labels = useMemo<ChartLabel[]>(() => {
    const L = store.ctx.services.get("layout") as HarbourLayout | undefined;
    const out: ChartLabel[] = [];
    // priority: the Pharos, then piers, then the top boats, then the other landmarks
    const landmarks = (L?.labels ?? []).filter((l) => l.kind === "landmark" && !l.id.startsWith("hamlet-"));
    const piers = (L?.labels ?? []).filter((l) => l.kind === "pier");
    const pharos = landmarks.find((l) => l.id === "pharos");
    if (pharos) out.push({ key: pharos.id, text: pharos.text, kind: "landmark", hit: { kind: "landmark", id: pharos.id } });
    // chain names sit on the water at the pier's approach, like a chart's water lettering
    for (const p of piers) out.push({ key: p.id, text: p.text, kind: "pier", hit: { kind: "harbour", id: p.text, at: [p.anchor[0], p.anchor[1] + 1, p.anchor[2]] } });
    for (const b of (model?.boats ?? []).filter((x) => x.state !== "wrecked").slice(0, 10)) out.push({ key: b.id, text: b.symbol, kind: "boat", hit: { kind: "boat", id: b.id } });
    for (const l of landmarks) if (l.id !== "pharos") out.push({ key: l.id, text: l.text, kind: "landmark", hit: { kind: "landmark", id: l.id } });
    return out;
  }, [store, model]);

  const refs = useRef<Array<HTMLSpanElement | null>>([]);
  const leaders = useRef<Array<HTMLElement | null>>([]);
  const pts = useRef<ScreenPoint[]>([]);
  const feet = useRef<ScreenPoint[]>([]);
  const boxes = useRef<LabelBox[]>([]);
  const measurements = useMeasurements();
  const kept = useRef<boolean[]>([]);

  useFrame(() => {
    if (!mounted) return;
    const vp = { w: innerWidth, h: innerHeight };
    const { hover, selected } = store.getSnapshot();
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i], el = refs.current[i];
      const pt = (pts.current[i] ??= { x: 0, y: 0, visible: false });
      const p = store.picking.screenPosition(l.hit, pt);
      const { w, h } = measurements.get(el);
      const box = (boxes.current[i] ??= { x: 0, y: 0, w: 0, h: 0, visible: false });
      // the hover tag already names this target: one name per object
      let visible = !!p?.visible && w > 0 && !sameHit(l.hit, hover) && !sameHit(l.hit, selected);
      if (visible && l.kind === "boat") {
        // a boat label must point at a hull you can see: off-screen or behind the town, it stands down
        const foot = store.picking.waterline(l.hit.id, (feet.current[i] ??= { x: 0, y: 0, visible: false }));
        visible = !!foot?.visible && !store.picking.hidden(l.hit.id);
      }
      box.w = w; box.h = h; box.visible = visible;
      box.x = (p?.x ?? 0) - w / 2; box.y = (p?.y ?? 0) - h - (l.kind === "boat" ? 10 : 0);
    }
    kept.current = cullLabels(boxes.current.slice(0, labels.length), 6, vp);
  });

  useFrameWrite(() => {
    if (!mounted) return;
    const keep = kept.current;
    for (let i = 0; i < labels.length; i++) {
      const el = refs.current[i], b = boxes.current[i];
      if (!el) continue;
      setStyle(el, "opacity", keep[i] ? "1" : "0");
      setStyle(el, "transform", `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0)`);
      const lead = leaders.current[i], foot = feet.current[i];
      if (lead && foot) setStyle(lead, "height", `${Math.max(0, foot.y - (b.y + b.h)).toFixed(1)}px`);
    }
  });

  if (!mounted) return null;
  return (
    <div className="hb-labels hb-fade" data-shown={shown} aria-hidden="true">
      {labels.map((l, i) => (
        <span key={l.key} ref={(el) => {
          if (refs.current[i] !== el) measurements.forget(refs.current[i]);
          refs.current[i] = el;
        }} className="hb-label" data-kind={l.kind} style={{ opacity: 0 }}>
          {l.text}
          {l.kind === "boat" && <i className="hb-label-leader" ref={(el) => { leaders.current[i] = el; }} />}
        </span>
      ))}
    </div>
  );
}
