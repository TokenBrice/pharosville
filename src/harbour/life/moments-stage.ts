import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { Bunting } from "../fleet/bunting";
import type { EventsService, StagedMoment } from "../model/event-hub";

/**
 * Staging for the events service's moments (model/event-hub.ts): the DATA scheduler has already confirmed each
 * event (two polls), budgeted it (≤ 1 per 3 min, ≤ 6 an hour) and bounded it (≤ 20 s, `endMs`); nothing is staged on
 * the first load or under reduced motion (the Day book still records everything). This only dresses the world:
 *   launch    she is dressed overall for her first circuit (fleet/bunting.ts: the flags run up from the bow); the
 *             sim already slid her down the ways
 *   depeg     the reef beacon's fire flares three times, warm white, slow (DEPEG_FLARES): the Shoals take her in;
 *             never a red strobe
 * Death (the tug's tow), recovery (sheeted home) and the band changes (the station's shapes are hauled up, the
 * Pharos's rhythm eases) are already staged by their owners; a recovery's gull lift-off needs perches on the reef
 * the gull system does not have, so it is not staged.
 */
const DEPEG_FLARES = 3;
const FLARE_GAP_S = 2.2, FLARE_S = 1.1;
const FLARE_HEX = "#FFE2B0";
/** The reef beacon's fire-bowl (layout zones.shoals.rocks: the beacon rock is the one of radius 4 m), height (m). */
const BEACON_ROCK_R = 4, BEACON_Y = 6.1;

function glowTexture(): THREE.Texture {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const r = Math.hypot(i + 0.5 - n / 2, j + 0.5 - n / 2) / (n / 2);
    const a = Math.max(0, 1 - r) ** 2.2;
    data.set([255, 255, 255, Math.round(a * 255)], (j * n + i) * 4);
  }
  const t = new THREE.DataTexture(data, n, n);
  t.needsUpdate = true;
  return t;
}

/** Flare envelope 0..1 at `t` s into a depeg moment: DEPEG_FLARES smooth bumps, then dark. */
export function flareAt(t: number): number {
  if (t < 0) return 0;
  const k = Math.floor(t / FLARE_GAP_S);
  if (k >= DEPEG_FLARES) return 0;
  const u = (t - k * FLARE_GAP_S) / FLARE_S;
  return u >= 1 ? 0 : Math.sin(Math.PI * u) ** 2;
}

export class MomentsStage implements WorldSystem {
  readonly name = "moments-stage";
  /** The staged moment last dressed (the service's `current`, polled: a system can start after a moment was staged). */
  private seen: StagedMoment | null = null;
  private flare: THREE.Sprite | null = null;
  private flareMat: THREE.SpriteMaterial | null = null;
  private flareFrom = -1;
  private flareUntil = -1;

  init(ctx: EngineContext): void {
    const shoals = (ctx.services.get("layout") as { zones?: { shoals?: { rocks?: number[][] } } } | undefined)?.zones?.shoals;
    const rock = shoals?.rocks?.find((r) => r[2] === BEACON_ROCK_R);
    if (rock) {
      this.flareMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(FLARE_HEX), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      this.flare = new THREE.Sprite(this.flareMat);
      this.flare.name = "moments-reef-flare";
      this.flare.position.set(rock[0], BEACON_Y, rock[1]);
      this.flare.scale.setScalar(7);
      this.flare.visible = false;
      ctx.scene.add(this.flare);
    }
  }

  private stage(ctx: EngineContext, m: StagedMoment): void {
    const e = m.event;
    if (e.kind === "launch" && e.coinId) (ctx.services.get("bunting") as Bunting | undefined)?.launch(e.coinId, m.startMs);
    if (e.kind === "depeg" && this.flare) {
      this.flareFrom = m.startMs;
      this.flareUntil = Math.min(m.endMs, m.startMs + DEPEG_FLARES * FLARE_GAP_S * 1000);
    }
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const cur = (ctx.services.get("events") as EventsService | undefined)?.current ?? null;
    if (cur && cur !== this.seen) { this.seen = cur; this.stage(ctx, cur); }
    if (!this.flare || !this.flareMat) return;
    const now = frame.nowMs;
    const on = this.flareFrom >= 0 && now < this.flareUntil;
    this.flare.visible = on;
    if (!on) return;
    const k = flareAt((now - this.flareFrom) / 1000);
    // the beacon's fire flares: brighter at night (into the bloom), a soft warm bloom by day
    const night = ctx.uniforms.uNight.value;
    this.flareMat.opacity = k * 0.9;
    this.flareMat.color.set(FLARE_HEX).multiplyScalar(1 + 1.5 * night);
  }

  dispose(ctx: EngineContext): void {
    if (this.flare) { ctx.scene.remove(this.flare); this.flareMat?.map?.dispose(); this.flareMat?.dispose(); }
  }
}
