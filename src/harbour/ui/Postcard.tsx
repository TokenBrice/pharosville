import { useEffect, useRef, useState } from "react";
import { readPresentation } from "./presentation";
import { useStore } from "./hooks";
import { composePostcard, postcardCaption } from "./postcard";

type Card = { url: string; file: string; alt: string };

/** Native modality owns focus containment; the generation guards late capture/encoding results. */
export function Postcard() {
  const store = useStore();
  const [phase, setPhase] = useState<"closed" | "creating" | "ready" | "failed">("closed");
  const [card, setCard] = useState<Card | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), save = useRef<HTMLAnchorElement>(null);
  const opener = useRef<HTMLElement | null>(null), url = useRef<string | null>(null);
  const busy = useRef(false), generation = useRef(0), open = useRef(false);
  const take = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    const capture = async () => {
      if (busy.current) return;
      busy.current = true;
      const id = ++generation.current;
      setPhase("creating");
      try {
        const frame = await store.captureFrame();
        if (!alive || id !== generation.current) return;
        const cap = postcardCaption(store.getSnapshot().model, store.ctx.timeOfDay.hour, Date.now(), readPresentation(store.ctx));
        const print = await composePostcard(frame, cap);
        const blob = await new Promise<Blob | null>((resolve) => print.toBlob(resolve, "image/png"));
        if (!alive || id !== generation.current) return;
        if (!blob) throw new Error("postcard encoding failed");
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(blob);
        setCard({ url: url.current, file: cap.file, alt: `${cap.title}. ${cap.fresh}` });
        setPhase("ready");
      } catch {
        if (alive && id === generation.current) setPhase("failed");
      } finally { busy.current = false; }
    };
    take.current = () => { void capture(); };
    const unsubscribe = store.onPostcard(() => {
      if (open.current || busy.current || document.querySelector("dialog[open]")) return;
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement ? active : null;
      open.current = true;
      for (const direction of ["up", "down", "left", "right"] as const) store.keyPan(direction, false);
      store.stopAutomation();
      void capture();
    });
    return () => {
      alive = false; unsubscribe();
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
    };
  }, [store]);

  useEffect(() => {
    if (phase !== "closed" && !dialog.current?.open) dialog.current?.showModal();
    if (phase === "ready") save.current?.focus({ preventScroll: true });
  }, [phase]);

  const close = () => {
    generation.current++; open.current = false;
    dialog.current?.close(); setPhase("closed"); setCard(null);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>(".hb-mark-btn");
    target?.focus({ preventScroll: true });
  };

  if (phase === "closed") return null;
  return <dialog ref={dialog} className="hb-postcard hb-paper" aria-label="Postcard"
    onCancel={(e) => { e.preventDefault(); close(); }} onClose={() => { if (open.current) close(); }}>
    {phase === "creating" && <p role="status">Creating postcard…</p>}
    {phase === "failed" && <><p role="alert">The postcard could not be created.</p><button type="button" className="hb-control" onClick={() => take.current()}>Try again</button></>}
    {phase === "ready" && card && <img src={card.url} alt={card.alt} />}
    <div className="hb-postcard-actions">
      {phase === "ready" && card && <a ref={save} className="hb-control" href={card.url} download={card.file}>Save</a>}
      <button type="button" className="hb-control" onClick={close}>Close</button>
    </div>
  </dialog>;
}
