import { useRef } from "react";
import { boatFact, harbourFact, landmarkFact } from "./facts";
import { useFrame, usePresence, useStore, useSticky, useUI } from "./hooks";
import { sameHit, type PickHit, type ScreenPoint } from "./services";

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

  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const p = store.picking.screenPosition(hit, pt.current);
    if (!p || !p.visible) { el.style.visibility = "hidden"; return; }
    el.style.visibility = "";
    const below = p.y < 64;
    el.dataset.below = String(below);
    // keep the tag inside the viewport horizontally (the leader stays on the anchor)
    const tag = el.firstElementChild as HTMLElement | null;
    if (tag) {
      const half = tag.offsetWidth / 2, maxX = innerWidth - 12;
      const shift = Math.min(0, maxX - (p.x + half)) + Math.max(0, 12 - (p.x - half));
      tag.style.transform = `translateX(calc(-50% + ${shift.toFixed(1)}px))`;
    }
    el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
  });

  let name = "", fact = "", decorative = false, swatch: string | null = null;
  if (hit.kind === "boat") {
    const b = store.boat(hit.id);
    if (b) {
      name = b.symbol;
      fact = boatFact(b, store.whereaboutsOf(b.id)).slice(b.symbol.length + 3);
      swatch = b.brandColor;
    }
  } else if (hit.kind === "landmark") {
    const lm = store.ctx.services.get("layout") as { landmarks: Array<{ id: string; name: string }> } | undefined;
    name = lm?.landmarks.find((l) => l.id === hit.id)?.name ?? hit.id;
    const f = landmarkFact(hit.id, model, store.underWay());
    fact = f.fact; decorative = !!f.decorative;
  } else {
    name = `${hit.id} harbour`;
    fact = harbourFact(hit.id, model);
  }
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
