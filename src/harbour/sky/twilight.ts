/**
 * E22 TWILIGHT STRUCTURE (pure, unit-tested; decorative calendar only). While the real sun stands between +3° and
 * −9°, the sky opposite it shows the Earth's shadow, a blue-grey band on the horizon, under the pink belt of Venus.
 * The shadow rises as the sun sinks and the whole wedge fades through the blue hour. The sun's height comes from
 * the visitor's real day (sunrise/sunset at the nominal latitude) and the clock; its azimuth is the scene's own
 * sunrise/sunset key (the painted sun is never moved, V18).
 */

const D2R = Math.PI / 180;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The real sun's elevation (deg) at a clock hour, from the day's sunrise/sunset (local clock) at `latitudeDeg`. */
export function sunElevationDeg(clockHour: number, sunrise: number, sunset: number, latitudeDeg: number): number {
  const lat = latitudeDeg * D2R;
  const h0 = ((sunset - sunrise) / 2) * 15 * D2R;
  // cos H0 = −tan(lat)·tan(decl) at sunrise/sunset, so the day length gives the declination
  const decl = Math.atan(-Math.cos(h0) / Math.tan(lat));
  let dh = clockHour - (sunrise + sunset) / 2;
  dh = ((dh + 12) % 24 + 24) % 24 - 12;
  const s = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(dh * 15 * D2R);
  return Math.asin(Math.min(1, Math.max(-1, s))) / D2R;
}

/** True in the afternoon and evening (after solar noon), false in the night's second half and the morning. */
export function isDusk(clockHour: number, sunrise: number, sunset: number): boolean {
  let dh = clockHour - (sunrise + sunset) / 2;
  dh = ((dh + 12) % 24 + 24) % 24 - 12;
  return dh > 0;
}

export interface TwilightWindow {
  /** 0..1: zero above +3° and below −9°, full from the sunset through the early blue hour. */
  k: number;
  /** Top of the Earth's shadow above the pretend horizon (band deg): it rises as the sun sinks. */
  shadowTop: number;
}

export function twilightWindow(sunElDeg: number): TwilightWindow {
  const k = (1 - smooth(1.5, 3, sunElDeg)) * smooth(-9, -4.5, sunElDeg);
  return { k, shadowTop: 0.6 + 2.0 * (1 - smooth(-7, 2, sunElDeg)) };
}

/** The TimeOfDay keys' sunrise / sunset azimuths (style C deg), swung by the day length as TimeOfDay swings them. */
const KEY_NOON_AZ = 160, KEY_RISE_AZ = 60, KEY_SET_AZ = 298, KEY_DAY = 19.85 - 6.0;
export function twilightSunAzimuth(dusk: boolean, sunrise: number, sunset: number): number {
  const swing = Math.min(1.12, Math.max(0.7, (sunset - sunrise) / KEY_DAY));
  return KEY_NOON_AZ + ((dusk ? KEY_SET_AZ : KEY_RISE_AZ) - KEY_NOON_AZ) * swing;
}

/** Band-space azimuth (deg, −180..180) opposite a view-relative sun azimuth. */
export function antiSolarTh(sunThDeg: number): number {
  return ((sunThDeg + 360) % 360 + 360) % 360 - 180;
}
