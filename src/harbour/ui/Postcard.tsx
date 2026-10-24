import { useEffect, useRef, useState } from "react";
import { useStore } from "./hooks";
import { composePostcard, postcardCaption } from "./postcard";

// (inline: the Harbour CSS sits at its byte budget)
const VEIL: React.CSSProperties = { position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(20, 18, 14, 0.42)", pointerEvents: "auto", zIndex: 40 };
const CARD: React.CSSProperties = { padding: "16px 16px 12px", width: "min(78vw, 1100px)", maxHeight: "calc(100vh - 56px)", display: "flex", flexDirection: "column", gap: 10 };
const IMG: React.CSSProperties = { display: "block", width: "100%", minHeight: 0, objectFit: "contain" };
const BTN: React.CSSProperties = { padding: "4px 12px", fontSize: 15, color: "var(--ink-2)", textDecoration: "none", border: "0.5px solid var(--brass)" };

/**
 * P: a postcard of the harbour as it is now. The overlay UI steps aside for the capture frame (the
 * world canvas never holds DOM chrome, but the hover lift and tag do go), then a small paper dialog
 * shows the print with Save and Close.
 */
export function Postcard() {
  const store = useStore();
  const [card, setCard] = useState<{ url: string; file: string; alt: string } | null>(null);
  const busy = useRef(false);
  const save = useRef<HTMLAnchorElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const take = async () => {
      if (busy.current) return;
      busy.current = true;
      const a = document.activeElement;
      returnTo.current = a instanceof HTMLElement && a !== document.body ? a : null;
      try {
        const frame = await store.captureFrame();
        const cap = postcardCaption(store.getSnapshot().model, store.ctx.timeOfDay.hour, Date.now());
        const print = await composePostcard(frame, cap);
        const blob = await new Promise<Blob | null>((res) => print.toBlob(res, "image/png"));
        if (blob) setCard({ url: URL.createObjectURL(blob), file: cap.file, alt: `${cap.title}. ${cap.fresh}` });
      } finally { busy.current = false; }
    };
    return store.onPostcard(() => { void take(); });
  }, [store]);

  useEffect(() => { if (card) save.current?.focus({ preventScroll: true }); }, [card]);

  const close = () => {
    if (card) URL.revokeObjectURL(card.url);
    setCard(null);
    const el = returnTo.current;
    if (el?.isConnected) el.focus({ preventScroll: true });
  };

  if (!card) return null;
  return (
    <div className="hb-postcard-veil" style={VEIL} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="hb-postcard hb-paper hb-neat" style={CARD} role="dialog" aria-modal="true" aria-label="Postcard"
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); } }}>
        <img src={card.url} alt={card.alt} style={IMG} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <a ref={save} style={BTN} href={card.url} download={card.file}>Save</a>
          <button type="button" style={BTN} onClick={close}>Close</button>
        </div>
      </section>
    </div>
  );
}
