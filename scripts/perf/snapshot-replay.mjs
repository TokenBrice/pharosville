/** Same-origin API replay only; preserves recorded status, source ages and bodies. */
export function replaySnapshot(snapshot) {
  const fetchReal = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return fetchReal(input, options);
    const row = snapshot.responses[url.pathname + url.search] ?? snapshot.responses[url.pathname];
    if (!row) throw new Error(`API snapshot missing ${url.pathname}${url.search}`);
    const headers = new Headers(row.headers);
    headers.delete("content-encoding"); headers.delete("content-length");
    return new Response(typeof row.body === "string" ? row.body : JSON.stringify(row.body), { status: row.status, headers });
  };
}

/** Anchor simulation wall time and RNG while keeping rAF/performance timestamps real for frame/load timing. */
export function pinCaptureClock({ epoch, seed = 20261019 }) {
  let state = seed >>> 0;
  Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const NativeDate = Date, start = performance.now();
  const now = () => epoch + Math.floor(performance.now() - start);
  function PinnedDate(...args) {
    if (!new.target) return new NativeDate(now()).toString();
    return Reflect.construct(NativeDate, args.length ? args : [now()], new.target);
  }
  PinnedDate.prototype = NativeDate.prototype;
  Object.setPrototypeOf(PinnedDate, NativeDate);
  PinnedDate.now = now;
  window.Date = PinnedDate;
}
