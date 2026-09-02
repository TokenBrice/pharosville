/**
 * W0.4: the one switch that turns instrumentation chrome back on.
 *
 * `?debug=1` is the project's existing debug flag — `scripts/pharosville/preview.mjs`
 * appends it to every URL it opens — so the perf lane keeps its on-screen frame
 * readout while the shipped world stays free of it. Accepted in the query string
 * or hash because either may already carry the world's own state.
 */
export function isDebugChromeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("debug") === "1") return true;
  const rawHash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(rawHash.startsWith("?") ? rawHash.slice(1) : rawHash).get("debug") === "1";
}
