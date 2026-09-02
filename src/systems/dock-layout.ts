interface ShoreFacingDock {
  station: { shoreBearing: number };
}

/** Cardinal berth-search vector derived from the station's authored land→sea bearing. */
export function dockSeawardVector(dock: ShoreFacingDock): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const x = Math.cos(dock.station.shoreBearing);
  const y = Math.sin(dock.station.shoreBearing);
  if (Math.abs(x) >= Math.abs(y)) return { x: x < 0 ? -1 : 1, y: 0 };
  return { x: 0, y: y < 0 ? -1 : 1 };
}
