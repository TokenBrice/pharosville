import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FrameState } from "../engine/types";
import type { HarbourUIStore, UIState } from "./store";

export const StoreContext = createContext<HarbourUIStore | null>(null);

export function useStore(): HarbourUIStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error("HarbourUIStore missing");
  return s;
}

export function useUI(): UIState {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot);
}

/** Subscribe to one slice; the component re-renders only when that slice changes (by identity). */
export function useUISlice<T>(select: (s: UIState) => T): T {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, () => select(s.getSnapshot()), () => select(s.getSnapshot()));
}

/** Per-frame callback inside the engine frame (positions only; never setState here). */
export function useFrame(fn: (frame: FrameState) => void): void {
  const s = useStore();
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  useEffect(() => s.onFrame((f) => ref.current(f)), [s]);
}

/**
 * Mount → next frame shown → (closing) hidden → unmount after the fade. Returns [mounted, shown].
 * With reduced motion the CSS fade collapses to a cut.
 */
export function usePresence(open: boolean, ms = 200): [boolean, boolean] {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) {
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      return () => cancelAnimationFrame(r);
    }
    const t = setTimeout(() => { setMounted(false); setEntered(false); }, ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return [mounted, open && entered];
}

/** The last non-null value (keeps a closing panel/tag showing its content while it fades out). */
export function useSticky<T>(value: T | null): T | null {
  const [last, setLast] = useState<T | null>(value);
  if (value != null && value !== last) setLast(value);
  return value ?? last;
}
