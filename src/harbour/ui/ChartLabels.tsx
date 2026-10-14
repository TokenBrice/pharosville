import { useMemo, useRef } from "react";
import type { HarbourLayout } from "../layout/types";
import { cullLabels, type LabelBox } from "./cull";
import { useFrame, usePresence, useStore, useUISlice } from "./hooks";
import type { PickHit, ScreenPoint } from "./services";

interface ChartLabel { key: string; text: string; kind: "landmark" | "pier" | "boat"; hit: PickHit; anchor?: [number, number, number] }

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
    if (pharos) out.push({ key: pharos.id, text: pharos.text, kind: "landmark", hit: { kind: "landmark", id: pharos.id }, anchor: pharos.anchor });
    for (const p of piers) out.push({ key: p.id, text: p.text, kind: "pier", hit: { kind: "harbour", id: p.text }, anchor: p.anchor });
    for (const b of (model?.boats ?? []).filter((x) => x.state !== "wrecked").slice(0, 10)) out.push({ key: b.id, text: b.symbol, kind: "boat", hit: { kind: "boat", id: b.id } });
    for (const l of landmarks) if (l.id !== "pharos") out.push({ key: l.id, text: l.text, kind: "landmark", hit: { kind: "landmark", id: l.id }, anchor: l.anchor });
    return out;
  }, [store, model]);

  const refs = useRef<Array<HTMLSpanElement | null>>([]);
  const pts = useRef<ScreenPoint[]>([]);
  const boxes = useRef<LabelBox[]>([]);

  useFrame(() => {
    if (!mounted) return;
    const vp = { w: innerWidth, h: innerHeight };
    for (let i = 0; i < labels.length; i++) {
      const el = refs.current[i];
      const pt = (pts.current[i] ??= { x: 0, y: 0, visible: false });
      const p = store.picking.screenPosition(labels[i].hit, pt);
      const w = el?.offsetWidth ?? 0, h = el?.offsetHeight ?? 0;
      const box = (boxes.current[i] ??= { x: 0, y: 0, w: 0, h: 0, visible: false });
      box.w = w; box.h = h; box.visible = !!p?.visible && w > 0;
      box.x = (p?.x ?? 0) - w / 2; box.y = (p?.y ?? 0) - h - (labels[i].kind === "boat" ? 4 : 0);
    }
    const keep = cullLabels(boxes.current.slice(0, labels.length), 6, vp);
    for (let i = 0; i < labels.length; i++) {
      const el = refs.current[i];
      if (!el) continue;
      el.style.opacity = keep[i] ? "1" : "0";
      el.style.transform = `translate3d(${boxes.current[i].x.toFixed(1)}px, ${boxes.current[i].y.toFixed(1)}px, 0)`;
    }
  });

  if (!mounted) return null;
  return (
    <div className="hb-labels hb-fade" data-shown={shown} aria-hidden="true">
      {labels.map((l, i) => (
        <span key={l.key} ref={(el) => { refs.current[i] = el; }} className="hb-label" data-kind={l.kind} style={{ opacity: 0 }}>{l.text}</span>
      ))}
    </div>
  );
}
