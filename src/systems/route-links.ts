const PHAROS_WATCH_ORIGIN = "https://pharos.watch";
const LOCAL_ROUTE_PATHS = new Set(["/"]);

export function analyticalRouteHref(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) return path;
  if (!path.startsWith("/")) return path;
  if (LOCAL_ROUTE_PATHS.has(path)) return path;
  return `${PHAROS_WATCH_ORIGIN}${path}`;
}
