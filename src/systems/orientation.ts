type MM = (q: string) => MediaQueryList;

export function observeOrientation(
  cb: (isPortrait: boolean) => void,
  matchMedia: MM = (q) => window.matchMedia(q),
): () => void {
  const mq = matchMedia("(orientation: portrait)");
  cb(mq.matches);
  const handler = (e: { matches: boolean }) => cb(e.matches);
  mq.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
  return () => mq.removeEventListener("change", handler as (e: MediaQueryListEvent) => void);
}
