import { useEffect, useRef, useState } from "react";
import { useStore } from "./hooks";
import { composePostcard, postcardCaption } from "./postcard";

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
    <div className="hb-postcard-veil" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="hb-postcard hb-paper hb-neat" role="dialog" aria-modal="true" aria-label="Postcard"
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); } }}>
        <img src={card.url} alt={card.alt} />
        <div className="hb-postcard-actions">
          <a ref={save} className="hb-postcard-btn" href={card.url} download={card.file}>Save</a>
          <button type="button" className="hb-postcard-btn" onClick={close}>Close</button>
        </div>
      </section>
    </div>
  );
}
