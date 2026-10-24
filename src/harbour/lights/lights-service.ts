import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import { lampJitter, lampRank, type LampWaveParams } from "./lamp-wave";

/**
 * 'lights' service: the harbour's many small lights (windows, quay lamps, pier heads, harbour lights,
 * riding lights). Each light gets, by kind: a projected light pool on the ground/planks, a bloomed
 * sprite, a shimmering pillar on the water when it stands by the sea, and — when it is among the 16
 * nearest the camera at night — a real point light. Everything scales with uWindowGlow / uNight.
 *
 * Pure data store; the LightsSystem owns the GPU side. Registered early (by the island system) so any
 * later system (fleet riding lights) can add lights during its own init.
 */
export type LightKind = "window" | "lamp" | "pierhead" | "harbourlight" | "riding" | "hearth" | (string & {});

export interface LightsService {
  add(kind: LightKind, position: THREE.Vector3Like | [number, number, number], color?: string | THREE.Color, radius?: number): number;
  setOn(id: number, on: boolean): void;
  remove(id: number): void;
  /** Move a light (riding lights on moving boats). Cheap; pools are not re-projected for moving kinds. */
  setPosition(id: number, position: THREE.Vector3Like | [number, number, number]): void;
  /**
   * The light's place in the lamplighting wave (05-P3): 0 lit first at dusk (the Pharos) … 1 last (the town
   * edge); at dawn they go out in reverse. A lamplighter can walk the lights in this order. -1 = unknown id.
   */
  rankOf?(id: number): number;
  /** Scale one light's whole output (pool, sprite, pillar, point light) 0..1, for fades. Default 1. */
  setIntensity?(id: number, k: number): void;
}

export interface KindSpec {
  color: string;
  /** Light-pool radius on the ground (m); 0 = none. */
  pool: number;
  /** Pool peak (E/π, linear) at full glow. */
  poolK: number;
  /** Sprite core size (m) and HDR brightness; size 0 = no sprite. */
  sprite: number;
  spriteK: number;
  /** Real point-light intensity (three units) when promoted. 0 = never promoted. */
  point: number;
  /** Mounting height above the surface it lights (for the pool height test). */
  mount: number;
}

export const KINDS: Record<string, KindSpec> = {
  window: { color: "#FFAE57", pool: 4.2, poolK: 0.22, sprite: 0, spriteK: 0, point: 0, mount: 2.6 },
  lamp: { color: "#FFAE57", pool: 6.5, poolK: 0.42, sprite: 0.55, spriteK: 14, point: 26, mount: 4.6 },
  pierhead: { color: "#FFD9A0", pool: 6.0, poolK: 0.42, sprite: 0.6, spriteK: 16, point: 26, mount: 4.6 },
  harbourlight: { color: "#FF5A3C", pool: 4.0, poolK: 0.35, sprite: 1.0, spriteK: 26, point: 30, mount: 4.0 },
  riding: { color: "#FFF2D6", pool: 0, poolK: 0, sprite: 0.32, spriteK: 18, point: 0, mount: 0 },
  /** The Pharos keeper's vigil lamp (05-P4): a tiny cool pinprick while the fire is banked (PSI unlit). */
  vigil: { color: "#DCE6F2", pool: 0, poolK: 0, sprite: 0.16, spriteK: 22, point: 0, mount: 0 },
  // 08-T9: hinterland hearths (farm doors, the windmill, the hill sanctuary, wayside lamps): warm, small and dim —
  // well under the town's lamps, never promoted to a point light
  hearth: { color: "#FF9A48", pool: 3.2, poolK: 0.16, sprite: 0.34, spriteK: 8, point: 0, mount: 1.8 },
};
const DEFAULT_KIND = KINDS.lamp;

export interface LightRecord {
  kind: LightKind;
  spec: KindSpec;
  position: THREE.Vector3;
  color: THREE.Color;
  radius: number;
  on: boolean;
  alive: boolean;
  /** Output scale 0..1 (setIntensity). */
  k: number;
}

export class LightsStore implements LightsService {
  readonly lights: LightRecord[] = [];
  private readonly free: number[] = [];
  /** Bumped on add/remove/on-off/static moves: the pool projection and attributes re-upload. */
  version = 0;
  /** Bumped on setPosition only (attributes re-upload, pools untouched). */
  moveVersion = 0;
  /** The lamplighting wave's parameters (the lights system keeps them current). */
  readonly wave: LampWaveParams = { x: 0, z: 0, footY: 0, rMin: 20, rMax: 400, hTop: 92, spread: 0, fromEdge: 0 };

  rankOf(id: number): number {
    const l = this.lights[id];
    return l && l.alive ? this.rankAt(l.position) : -1;
  }

  rankAt(p: THREE.Vector3Like): number {
    return lampRank(p.x, p.y, p.z, lampJitter(p.x, p.z), this.wave);
  }

  add(kind: LightKind, position: THREE.Vector3Like | [number, number, number], color?: string | THREE.Color, radius?: number): number {
    const spec = KINDS[kind] ?? DEFAULT_KIND;
    const rec: LightRecord = {
      kind, spec,
      position: Array.isArray(position) ? new THREE.Vector3(...position) : new THREE.Vector3(position.x, position.y, position.z),
      color: color instanceof THREE.Color ? color.clone() : new THREE.Color(color ?? spec.color),
      radius: radius ?? spec.pool,
      on: true, alive: true, k: 1,
    };
    const id = this.free.length ? this.free.pop()! : this.lights.length;
    this.lights[id] = rec;
    this.version++;
    return id;
  }

  setOn(id: number, on: boolean): void {
    const l = this.lights[id];
    if (l && l.alive && l.on !== on) { l.on = on; this.version++; }
  }

  setIntensity(id: number, k: number): void {
    const l = this.lights[id];
    const v = Math.min(1, Math.max(0, k));
    if (l && l.alive && l.k !== v) { l.k = v; this.version++; }
  }

  remove(id: number): void {
    const l = this.lights[id];
    if (!l || !l.alive) return;
    l.alive = false; l.on = false;
    this.free.push(id);
    this.version++;
  }

  setPosition(id: number, p: THREE.Vector3Like | [number, number, number]): void {
    const l = this.lights[id];
    if (!l || !l.alive) return;
    if (Array.isArray(p)) l.position.set(p[0], p[1], p[2]); else l.position.set(p.x, p.y, p.z);
    if (l.spec.pool > 0 && l.radius > 0) this.version++; else this.moveVersion++;
  }
}

/** The shared 'lights' service (created on first use). */
export function getLightsStore(ctx: EngineContext): LightsStore {
  let s = ctx.services.get("lights") as LightsStore | undefined;
  if (!s) { s = new LightsStore(); ctx.services.set("lights", s); }
  return s;
}
