/**
 * UI-facing service contracts. The UI reads engine services lazily (they are replaced on rebuild,
 * e.g. 'model'), so nothing here caches a service object for longer than a frame.
 */
import type { EngineContext } from "../engine/types";
import type { HarbourFeed } from "../data/fetch";
import type { HarbourLayout } from "../layout/types";
import type { HarbourModel } from "../model/types";
import type { HarbourSim } from "../sim/sim";

export type PickKind = "boat" | "landmark" | "harbour";

/**
 * What the pointer is over. boat → coin id; landmark → layout landmark id; harbour → chain name.
 * `at`: the world point the pointer found it at (a pier is long; its tag hangs where you pointed).
 * Identity (sameHit) ignores `at`.
 */
export interface PickHit { kind: PickKind; id: string; at?: [number, number, number] }

/** CSS pixels relative to the viewport. `visible` is false when behind the camera or off screen. */
export interface ScreenPoint { x: number; y: number; visible: boolean }

/**
 * The UI's picker (ui/picking.ts). It composes the fleet's 'picking' service (exact rendered hulls,
 * see WorldPicking) with an analytic picker for landmarks, piers and sea areas, and adds world
 * positions for camera flights. It is internal to the UI, never registered as a service.
 */
export interface PickingService {
  pick(clientX: number, clientY: number): PickHit | null;
  /** The object's tag anchor (above the mast / roof) in viewport CSS px. */
  screenPosition(hit: PickHit, out?: ScreenPoint): ScreenPoint | null;
  /** The object's ground position (x, y, z), for camera flights. */
  worldPosition(hit: PickHit): [number, number, number] | null;
  /** A boat's waterline in viewport CSS px (chart-label leaders). */
  waterline(id: string, out?: ScreenPoint): ScreenPoint | null;
  /** True when the static island (terrain, buildings) hides the boat's hull and lower sail from the camera. */
  hidden(id: string): boolean;
  setHover(hit: PickHit | null): void;
  setSelected(hit: PickHit | null): void;
}

/** The fleet's 'picking' service shape (src/harbour/fleet/fleet-system.ts), read structurally. */
export interface WorldPicking {
  pick(clientX: number, clientY: number): { kind: "boat" | "landmark"; id: string } | null;
  screenPosition(kind: "boat" | "landmark", id: string): { x: number; y: number; visible: boolean };
  setHover(id: string | null): void;
  setSelected(id: string | null): void;
}

/**
 * 'motion' service: prefers-reduced-motion as an engine-wide flag. Systems that animate for
 * decoration (camera flights, fleet bobbing, gulls) may honour `reduced`; the UI always does.
 */
export interface MotionService {
  readonly reduced: boolean;
  subscribe(fn: (reduced: boolean) => void): () => void;
}

export function ensureMotionService(ctx: EngineContext): MotionService {
  const existing = ctx.services.get("motion") as MotionService | undefined;
  if (existing) return existing;
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const forced = new URLSearchParams(location.search).get("motion");
  let reduced = forced === "reduce" ? true : forced === "full" ? false : mq?.matches ?? false;
  const listeners = new Set<(r: boolean) => void>();
  mq?.addEventListener("change", (e) => {
    if (forced) return;
    reduced = e.matches;
    for (const fn of listeners) fn(reduced);
  });
  const svc: MotionService = {
    get reduced() { return reduced; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  ctx.services.set("motion", svc);
  return svc;
}

export const getModel = (ctx: EngineContext) => (ctx.services.get("model") as HarbourModel | undefined) ?? null;
export const getSim = (ctx: EngineContext) => (ctx.services.get("sim") as HarbourSim | undefined) ?? null;
export const getLayout = (ctx: EngineContext) => (ctx.services.get("layout") as HarbourLayout | undefined) ?? null;
export const getFeed = (ctx: EngineContext) => (ctx.services.get("feed") as HarbourFeed | undefined) ?? null;
export const getWorldPicking = (ctx: EngineContext) => (ctx.services.get("picking") as WorldPicking | undefined) ?? null;
/** The island's top-down height field (src/harbour/world/ground.ts), read structurally. */
export interface GroundLike { heightAt(x: number, z: number): number }
export const getGround = (ctx: EngineContext) => (ctx.services.get("ground") as GroundLike | undefined) ?? null;

export interface LighthouseLike { readonly period: number; readonly lit: boolean }
export const getLighthouse = (ctx: EngineContext) => (ctx.services.get("lighthouse") as LighthouseLike | undefined) ?? null;

export const sameHit = (a: PickHit | null | undefined, b: PickHit | null | undefined) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);
