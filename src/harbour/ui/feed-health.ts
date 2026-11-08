import { useEffect, useState } from "react";
import type { HarbourPayloads } from "../model/types";
import { getFeed } from "./services";
import { useStore } from "./hooks";

/** Connectivity describes transport, never the age or meaning of an observation. */
export function transportCopy(payloads: HarbourPayloads, online: boolean, refreshingOverdue = false): string {
  const saved = payloads.stablecoins?.data != null;
  if (!online) return saved ? "You’re offline. Showing saved readings." : "You’re offline. Fleet readings unavailable.";
  if (refreshingOverdue) return "Refreshing overdue readings.";
  const rows = Object.values(payloads);
  if (!saved && rows.some((s) => s.error || s.degradedTransport || s.staleFallback)) return "Fleet readings unavailable.";
  const degraded = rows.filter((s) => (s.failureStreak ?? 0) >= 2 || s.degradedTransport || s.staleFallback);
  if (!degraded.length) return "";
  return degraded.some((s) => s.failureKind === "invalid-payload")
    ? "A reading could not be used. Showing saved readings." : "Refresh delayed — showing saved readings.";
}

export function useFeedHealth(): string {
  const store = useStore();
  const feed = getFeed(store.ctx);
  const read = () => transportCopy(feed?.payloads ?? {}, typeof navigator === "undefined" || navigator.onLine !== false, feed?.refreshingOverdue ?? false);
  const [copy, setCopy] = useState(read);
  useEffect(() => {
    let active = true;
    const update = () => { if (active) setCopy(transportCopy(feed?.payloads ?? {}, navigator.onLine !== false, feed?.refreshingOverdue ?? false)); };
    // Run after the feed's wake listener has admitted any actual overdue requests.
    const wake = () => queueMicrotask(update);
    update();
    const unsub = feed?.subscribe(wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    document.addEventListener("visibilitychange", wake);
    return () => { active = false; unsub?.(); window.removeEventListener("online", wake); window.removeEventListener("offline", wake); document.removeEventListener("visibilitychange", wake); };
  }, [feed]);
  return copy;
}
