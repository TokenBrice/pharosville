import * as THREE from "three";
import type { BeamService } from "../beam/beam-system";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourFeed } from "../data/fetch";
import type { HarbourModel } from "../model/types";
import type { OceanService } from "../ocean/ocean-system";
import { acquireFxTextures, type FxTextures } from "../ocean/textures";
import type { LightsService } from "../lights/lights-service";
import type { LighthouseService } from "../world/lighthouse-system";
import { getHarbourMaterials } from "../world/materials";
import {
  applyDevOverrides, deriveTargets, DEV_OVERRIDE_KEYS, TIDE_FULL_SCALE_PCT,
  type AlertCoin, type LampStep, type LandmarkId, type LandmarkReading, type TideReading, type WorldTargets,
} from "./bind";
import { StaleFog } from "./fog";
import { StormCones, type SignalRig } from "./storm-cones";
import { TideGauge } from "./tide-gauge";

/**
 * READINGS: binds model.readings to the world services every time the model updates, always easing
 * (2–4 s; the fog 10 s), never popping. See bind.ts for the grammar.
 *
 * Service 'readings' (for the UI): per-landmark freshness (current / stale / unknown + age), the
 * tide reading, the mint/burn flow scope (the Mint and the Burn read it: src/harbour/civic), the fog amount. Registered right after the data system so
 * the weather director (next) reads its targets before the sky and the island use them.
 *
 * Dev only: ?psi=TREMOR|none ?psiScore=55 ?offpeg=0.06 ?dews=ALERT ?cones=3 ?tide=-0.8 ?stale=1
 * (see bind.ts applyDevOverrides). The engine's own ?sea= ?cloud= ?wind= ?lamp= ?reach= win.
 */
export interface ReadingsService {
  /** Bumped whenever the targets change. */
  readonly version: number;
  readonly landmarks: Readonly<Record<LandmarkId, LandmarkReading>>;
  /** Wall-clock ms the landmark ages were measured at (add elapsed time for a live age). */
  readonly asOfMs: number;
  readonly tide: Readonly<TideReading & { fullScalePct: number }>;
  /** Mint/burn flows: the 24 h net and the chains the data covers (the Mint and the Burn show it, D19). */
  readonly flows: Readonly<{ net24hUsd: number | null; scope: string[]; available: boolean; stale: boolean }>;
  readonly psi: Readonly<WorldTargets["psi"]>;
  /** Shapes on the storm station's mast = the supply-weighted DEWS level (0 Calm … 4 Danger); null = no reading. */
  readonly cones: number | null;
  /** The weather band the mast and the sky both show (null = no stress reading). */
  readonly stormBand: NonNullable<WorldTargets["weather"]>["band"] | null;
  /** The DEWS weather target (continuous level 0..4) the weather director eases toward; null = no stress reading. */
  readonly weather: WorldTargets["weather"];
  /** Red pennant at the masthead (band DANGER). */
  readonly pennant: boolean;
  /** The individual coins at Alert or worse, worst first (the panel lists them; the mast does not count them). */
  readonly alerts: readonly AlertCoin[];
  /** Sea fog now, 0..1 (only ever non-zero when the fleet data is stale/unavailable). */
  readonly fog: number;
  /** True when dev URL overrides are bending the readings. */
  readonly overridden: boolean;
  subscribe(fn: () => void): () => void;
}

interface MotionLike { readonly reduced: boolean }

/** Lantern glow colour per lamp step (linear-ish multipliers for the lighthouse glow sprite). */
const LANTERN: Array<[number, number, number]> = [[1.0, 0.86, 0.62], [1.0, 0.58, 0.2], [1.0, 0.2, 0.11]];
/** Beam / halo colour per lamp step: warm white, amber, signal red. */
const BEAM_HEX = ["#FFE8C2", "#FFA63D", "#FF4A36"] as const;
/** Lens emissive per step (the cached 'lens' material). */
const LENS_HEX = ["#FFE0A8", "#FFB04A", "#FF5A3E"] as const;
const FOG_IN_SEC = 10, FOG_OUT_SEC = 6;
const SWEEP_TAU = 1.2, LIT_SEC = 2.5;
/** Daytime lens boost under a caution lamp (× uLamp ≈ 0.4 at noon): a steady lit glass + the rhythm flare. */
const DAY_LAMP = 14, DAY_FLASH = 40;

export class ReadingsSystem implements WorldSystem {
  readonly name = "readings";
  private model: HarbourModel | null = null;
  private targets: WorldTargets | null = null;
  private version = 0;
  private readonly listeners = new Set<() => void>();
  private readonly q = new URLSearchParams(location.search);
  private readonly dev = import.meta.env.DEV && DEV_OVERRIDE_KEYS.some((k) => this.q.has(k));
  private fx: FxTextures | null = null;
  private fog: StaleFog | null = null;
  private fogS = 0;
  private periodS = 12;
  private litS = 1;
  private lastLamp = -1;
  private lastReach = -1;
  private lastSea: number | null = -1;
  private windS = 0.3;
  private alertS = 0;
  private gauge: TideGauge | null = null;
  private cones: StormCones | null = null;
  private signalMissing = false;
  private landmarksBound = false;
  private bindTries = 0;
  private heldFor: boolean | null = null;
  /** The Pharos lamp glass: its own material so it can go dark (unknown PSI) and take the lamp colour. */
  private lensMat: THREE.MeshStandardMaterial | null = null;
  private readonly lensLevel: THREE.IUniform<number> = { value: 1 };

  init(ctx: EngineContext): void {
    this.fx = acquireFxTextures(ctx);
    this.fog = new StaleFog(ctx.composer, ctx.camera, this.fx.noise, ctx.uniforms.uTime);
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- getters below read live system state
    const sys = this;
    const svc: ReadingsService = {
      get version() { return sys.version; },
      get landmarks() { return sys.targets?.landmarks ?? EMPTY_LANDMARKS; },
      get asOfMs() { return sys.model?.builtAtMs ?? 0; },
      get tide() { return { ...(sys.targets?.tide ?? { pct: null, level: 0 }), fullScalePct: TIDE_FULL_SCALE_PCT }; },
      get flows() {
        const f = sys.targets?.flows;
        return { net24hUsd: f?.net24hUsd ?? null, scope: f?.scope ?? [], available: f?.available ?? false, stale: f?.stale ?? false };
      },
      get psi() { return sys.targets?.psi ?? { lit: false, sweepSec: 12, reach: 0, lamp: 0 as LampStep, band: null, score: null, qualified: false }; },
      get cones() { return sys.targets?.cones ?? null; },
      get stormBand() { return sys.targets?.weather?.band ?? null; },
      get weather() { return sys.targets?.weather ?? null; },
      get pennant() { return sys.targets?.pennant ?? false; },
      get alerts() { return sys.targets?.alerts ?? []; },
      get fog() { return sys.fogS; },
      get overridden() { return sys.dev; },
      subscribe(fn) { sys.listeners.add(fn); return () => sys.listeners.delete(fn); },
    };
    ctx.services.set("readings", svc);
  }

  /** Island + lighthouse nodes load after this system's init: bind them on the first frames. */
  private bindLandmarks(ctx: EngineContext): void {
    if (this.landmarksBound || this.bindTries++ > 600) return;
    const scene = ctx.scene;
    // the island's named nodes mark "the island is in" (the tide board is gone, P6 D19; the old storm mast may go too)
    const oldMast = scene.getObjectByName("storm_mast");
    if (!oldMast && !scene.getObjectByName("tide_gauge")) return;
    // the storm signal has ONE home, the Storm-signal Station's own mast (bindSignal): the island's old mast goes
    oldMast?.removeFromParent();
    let levelNode: THREE.Object3D | null = null;
    scene.traverse((o) => { if (/^tide_gauge_level/.test(o.name)) levelNode = o; });
    this.landmarksBound = true;
    this.bindLens(ctx);
    if (levelNode) this.gauge = new TideGauge(levelNode);
  }

  /** The station's signal rig (civic plot 'stormstation', manifest anchor 'signal'): hoist the DEWS shapes there. */
  private bindSignal(ctx: EngineContext): void {
    if (this.cones || this.signalMissing) return;
    const civic = ctx.services.get("civic") as { plots?: ReadonlyMap<string, { kind: string; root: THREE.Object3D; anchors?: Record<string, unknown> }> } | undefined;
    if (!civic?.plots) return;
    let plot: { root: THREE.Object3D; anchors?: Record<string, unknown> } | undefined;
    for (const p of civic.plots.values()) if (p.kind === "stormstation") plot = p;
    if (!plot) return;
    const rig = plot.anchors?.signal as SignalRig | undefined;
    if (!rig?.slots?.length) { this.signalMissing = true; return; }
    const mats = getHarbourMaterials(ctx);
    // moored bows point into the wind (layout.wind): the pennant streams the other way
    const bow = (ctx.services.get("layout") as { wind?: { bowHeadingRad?: number } } | undefined)?.wind?.bowHeadingRad ?? -1.0;
    this.cones = new StormCones(plot.root, rig, mats.kit(), mats.emissive("#FF3A26", "#3A1712"),
      ctx.services.get("lights") as LightsService | undefined, bow + Math.PI);
    this.cones.setCount(this.targets?.cones ?? null, this.targets?.pennant ?? false);
  }

  private bindLens(ctx: EngineContext): void {
    const root = ctx.scene.getObjectByName("harbour-lighthouse");
    if (!root) return;
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color("#3B3A33"), roughness: 0.15, metalness: 0, emissive: new THREE.Color(LENS_HEX[0]) });
    m.name = "hb_pharos_lamp";
    const lamp = ctx.uniforms.uLamp, level = this.lensLevel;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uLamp = lamp;
      shader.uniforms.uLensLevel = level;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uLamp;\nuniform float uLensLevel;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uLamp * uLensLevel;");
    };
    let bound = false;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name === "hb_emissive") { mesh.material = m; bound = true; }
    });
    if (bound) this.lensMat = m; else m.dispose();
  }

  private retarget(ctx: EngineContext, model: HarbourModel): void {
    const feed = ctx.services.get("feed") as HarbourFeed | undefined;
    const chains = feed?.payloads.chains?.data;
    let t = deriveTargets({
      model,
      chainsChange7d: chains?.globalChange7dPct,
      stablecoinsAttempted: feed?.payloads.stablecoins !== undefined,
    });
    if (this.dev) t = applyDevOverrides(t, this.q);
    this.targets = t;
    this.version++;
    this.cones?.setCount(t.cones, t.pennant);
    for (const fn of this.listeners) fn();
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const dt = frame.delta;
    const model = ctx.services.get("model") as HarbourModel | undefined;
    if (model && model !== this.model) { this.model = model; this.retarget(ctx, model); }
    this.bindLandmarks(ctx);
    this.bindSignal(ctx);
    const t = this.targets;
    if (!t) return;
    const U = ctx.uniforms;
    const motion = ctx.services.get("motion") as MotionLike | undefined;
    const reduced = motion?.reduced ?? (import.meta.env.DEV && this.q.get("motion") === "reduce");

    // ---- 1. PSI → the Pharos (rhythm, lamp colour, lit) and the beam (reach, colour)
    // until /api/stability-index has been tried the Pharos keeps its boot state (SYNCING is not "unlit")
    const psiTried = this.dev || (ctx.services.get("feed") as HarbourFeed | undefined)?.payloads.stability !== undefined;
    const lh = psiTried ? ctx.services.get("lighthouse") as LighthouseService | undefined : undefined;
    const beam = psiTried ? ctx.services.get("beam") as BeamService | undefined : undefined;
    if (lh) {
      this.periodS += (t.psi.sweepSec - this.periodS) * (1 - Math.exp(-dt / SWEEP_TAU));
      if (Math.abs(lh.period - this.periodS) > 1e-3) lh.setSweep(this.periodS);
      const litT = t.psi.lit ? 1 : 0;
      this.litS = litT > this.litS ? Math.min(litT, this.litS + dt / LIT_SEC) : Math.max(litT, this.litS - dt / LIT_SEC);
      const litE = this.litS * this.litS * (3 - 2 * this.litS);
      if (lh.setLitLevel) lh.setLitLevel(litE);
      else lh.setLit(this.litS > 0.5);
      // caution by day: the lantern is lit amber in daylight (a steady lamp behind the glass) and
      // flares as each beam panel swings past the viewer, so TREMOR+ reads on the Pharos at noon
      const alertT = t.psi.lit && t.psi.lamp > 0 ? 1 : 0;
      this.alertS += (alertT - this.alertS) * (1 - Math.exp(-dt / 2));
      const day = 1 - U.uNight.value;
      let flash = 0;
      if (this.alertS > 1e-3 && day > 1e-3) {
        const h = lh.sweepAngle(), cam = ctx.camera.position, lp = lh.lanternPosition;
        const tx = cam.x - lp.x, tz = cam.z - lp.z, l = Math.hypot(tx, tz) || 1;
        flash = Math.pow(Math.abs((Math.sin(h) * tx + Math.cos(h) * tz) / l), 12);
      }
      this.lensLevel.value = litE * (1 + this.alertS * day * (DAY_LAMP + DAY_FLASH * flash));
      beam?.setDayPresence?.(this.alertS);
    }
    const lhAny = ctx.services.get("lighthouse") as LighthouseService | undefined;
    if (lhAny && this.heldFor !== reduced) {
      this.heldFor = reduced;
      lhAny.hold?.(reduced ? cameraLeftHeading(ctx.camera) : null);
    }
    if (beam) {
      // unlit: ease the beam to black (the beam lerps its colour), so the lantern goes out, not off
      const step: LampStep = t.psi.lamp;
      const lamp = t.psi.lit ? step : -1;
      if (lamp !== this.lastLamp && !this.q.has("lamp")) {
        this.lastLamp = lamp;
        beam.setColor(t.psi.lit ? BEAM_HEX[step] : "#000000");
        if (t.psi.lit) {
          lh?.setLampColor?.(new THREE.Color(...LANTERN[step]));
          this.lensMat?.emissive.set(LENS_HEX[step]);
        }
      }
      if (t.psi.reach !== this.lastReach && !this.q.has("reach")) { this.lastReach = t.psi.reach; beam.setReach(t.psi.reach); }
      beam.setQualified?.(t.psi.qualified === true);
    }

    // ---- 2. sea state (the ocean eases its own swell)
    const ocean = ctx.services.get("ocean") as OceanService | undefined;
    if (ocean && t.sea !== this.lastSea && !this.q.has("sea")) {
      this.lastSea = t.sea;
      if (t.sea != null) ocean.setSeaState(t.sea);
    }

    // ---- 3. weather: DEWS → the weather director (src/harbour/weather) eases the sky, wind, rain/snow,
    //      lightning and the overcast light from `weather` (no random weather); the mast's flag flaps here
    const w = t.weather;
    this.windS += ((w?.wind ?? 0.3) - this.windS) * (1 - Math.exp(-dt * 0.5));

    // ---- 4. fog, only for stale / unavailable fleet data; rolls in over 10 s
    const fogT = t.fog ? 1 : 0;
    this.fogS = fogT > this.fogS ? Math.min(1, this.fogS + dt / FOG_IN_SEC) : Math.max(0, this.fogS - dt / FOG_OUT_SEC);
    const fogE = this.fogS * this.fogS * (3 - 2 * this.fogS);
    this.fog?.update(fogE, U.uHaze.value, U.uHorizon.value, U.uNight.value);

    // ---- 5–6. landmarks: the storm signal (the station's mast), the tide gauge
    const glow = U.uWindowGlow.value;
    this.cones?.update(dt, frame.elapsed, this.windS, reduced, ctx.camera.position);
    this.gauge?.update(dt, t.tide.level, t.tide.pct != null, t.landmarks["tide-gauge"].state === "stale", glow, reduced);
  }

  dispose(ctx: EngineContext): void {
    this.fog?.dispose();
    this.fx?.release();
    this.gauge?.dispose();
    this.cones?.dispose();
    this.lensMat?.dispose();
    ctx.services.delete("readings");
  }
}

const EMPTY_LANDMARKS = {} as Record<LandmarkId, LandmarkReading>;

/** Heading (layout convention: beam along (sin h, 0, cos h)) pointing to the screen-left, a little toward the viewer. */
function cameraLeftHeading(camera: THREE.PerspectiveCamera): number {
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  const rx = e[0], rz = e[2];          // camera right (world)
  const bx = e[8], bz = e[10];         // camera back (toward the viewer)
  const x = -rx + 0.35 * bx, z = -rz + 0.35 * bz;
  return Math.atan2(x, z);
}
