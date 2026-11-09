/**
 * E23 LEGIBLE NIGHT SKY (pure, unit-tested; decorative calendar texture, M+ only). The W05 Milky Way leans through the
 * visible band, from the horizon out of the frame top, turning with the clock; W06 meteors are born inside the camera
 * band with most of their streak in view, and the shower keeps today's visible rarity (Q5: the spawn interval grows
 * by the visibility gain).
 */

/** The band's lean from the horizon (deg): 60° in the evening, laid over to 35° before dawn. */
export function milkyWayTiltDeg(clockHour: number): number {
  const n = Math.min(1, Math.max(0, (((clockHour - 19) % 24) + 24) % 24 / 10));
  return 60 - 25 * n;
}

/** The band's foot on the horizon (view-relative deg, like the moon's station): right of the harbour, drifting in. */
export function milkyWayFootTh(clockHour: number): number {
  const n = Math.min(1, Math.max(0, (((clockHour - 19) % 24) + 24) % 24 / 10));
  return 13 - 6 * n;
}

export interface MeteorSpawn { th0: number; e0: number; dx: number; dy: number; len: number }

/** Share (0..1) of a streak's path [start, start + len·dir] inside the visible band (|th| ≤ half, 0.25° ≤ e ≤ top). */
export function meteorVisibleShare(m: MeteorSpawn, halfDeg: number, visTop: number): number {
  let n = 0;
  const N = 24;
  for (let i = 0; i < N; i++) {
    const s = ((i + 0.5) / N) * m.len, th = m.th0 + m.dx * s, e = m.e0 + m.dy * s;
    if (Math.abs(th) <= halfDeg && e >= 0.25 && e <= visTop) n++;
  }
  return n / N;
}

export const METEOR_E_MIN = 1.2, METEOR_TOP_MARGIN = 0.6, METEOR_MIN_SHARE = 0.6;

/**
 * A meteor born inside the camera band (e0 ∈ [1.2°, visTop − 0.6°]), travelling away from the radiant, its length
 * shortened (bounded: eight steps at most) until ≥ 60 % of the streak stays in view; null when the band is too thin.
 */
export function spawnMeteor(R: () => number, halfDeg: number, visTop: number, radiantTh: number): MeteorSpawn | null {
  const hi = visTop - METEOR_TOP_MARGIN;
  if (hi < METEOR_E_MIN) return null;
  const th0 = (R() * 2 - 1) * halfDeg * 0.7, e0 = METEOR_E_MIN + R() * (hi - METEOR_E_MIN);
  let dx = th0 - Math.min(halfDeg * 1.5, Math.max(-halfDeg * 1.5, radiantTh)), dy = e0 - 14;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const m = { th0, e0, dx, dy, len: 2.5 + R() * 3 };
  for (let i = 0; i < 8 && meteorVisibleShare(m, halfDeg, visTop) < METEOR_MIN_SHARE; i++) m.len *= 0.75;
  return meteorVisibleShare(m, halfDeg, visTop) >= METEOR_MIN_SHARE ? m : null;
}

/**
 * Q5: today's spawns (e0 = 3.5–8.5°) are seen only when they start inside the band; E23's always are. The interval
 * grows by that visibility gain so the VISIBLE rate stays as it was (the F9 default view: ×1/0.3).
 */
export function meteorIntervalGain(visTop: number): number {
  return 1 / Math.min(1, Math.max(0.3, (visTop - 3.5) / 5));
}
