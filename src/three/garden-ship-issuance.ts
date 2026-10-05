import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import type { ShipVisual } from "./garden-ships";
import { stableUnit } from "./garden-util";
import { shipIssuanceVisualState } from "../systems/ship-issuance";

export const SHIP_ISSUANCE_WORKSET_NAME = "fleet-ship-issuance-worksets";
const LIGHTERS_PER_SHIP = 2;

export interface ShipIssuanceWorksetSpec {
  activity: "minting" | "redeeming" | "balanced-active";
  hasLargestEvent: boolean;
  hullRadius: number;
  shipId: string;
  eligible: boolean;
  overviewWork: boolean;
}

export function shipIssuanceWorksetSpecs(ships: readonly ShipVisual[]): ShipIssuanceWorksetSpec[] {
  return ships.flatMap((visual) => {
    const issuance = visual.ship.issuance;
    if (!issuance || issuance.activity === null || issuance.activity === "inactive" || shipIssuanceVisualState(issuance) === null) return [];
    return [{
      activity: issuance.activity,
      hasLargestEvent: issuance.largestEvent24h !== null,
      hullRadius: visual.selectionRadius,
      shipId: visual.ship.id,
      eligible: issuance.work.eligible,
      overviewWork: issuance.work.overviewRank !== null,
    }];
  });
}

export interface GardenShipIssuanceWorksets {
  readonly count: number;
  readonly root: Group;
  dispose(): void;
  place(index: number, x: number, y: number, z: number, yaw: number, visible?: boolean): void;
  flush(input: { detail: number; overview: boolean; reducedMotion: boolean; timeSeconds: number }): void;
}

function paint(geometry: BufferGeometry, color: Color): BufferGeometry {
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

function worksetGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const timber = new Color(HARBOR_PALETTE.timber_warm);
  const canvas = new Color(HARBOR_PALETTE.foam_white);
  const iron = new Color(HARBOR_PALETTE.iron_dark);
  // Low open lighter, cargo block, two davit posts, and one raised crane hook.
  const hull = new BoxGeometry(1.45, 0.2, 0.58);
  hull.translate(0, 0.1, 0);
  parts.push(paint(hull, timber));
  const cargo = new BoxGeometry(0.68, 0.42, 0.46);
  cargo.translate(0, 0.42, 0);
  parts.push(paint(cargo, canvas));
  for (const x of [-0.56, 0.56]) {
    const davit = new CylinderGeometry(0.035, 0.045, 0.72, 5);
    davit.translate(x, 0.58, 0);
    parts.push(paint(davit, iron));
  }
  const hook = new BoxGeometry(0.08, 0.78, 0.08);
  hook.translate(0, 1.03, 0);
  parts.push(paint(hook, iron));
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("ship issuance workset geometry failed to merge");
  return merged;
}

export function createGardenShipIssuanceWorksets(
  specs: readonly ShipIssuanceWorksetSpec[],
  initialMix = 1,
): GardenShipIssuanceWorksets {
  const root = new Group();
  root.name = SHIP_ISSUANCE_WORKSET_NAME;
  const count = specs.length * LIGHTERS_PER_SHIP;
  if (count === 0) return { count: 0, root, dispose() {}, place() {}, flush() {} };

  const geometry = worksetGeometry();
  const material = new MeshStandardMaterial({ flatShading: true, roughness: 0.92, vertexColors: true });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = SHIP_ISSUANCE_WORKSET_NAME;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  const ordinary = new Color(1, 1, 1);
  const eventLift = new Color(HARBOR_PALETTE.lantern_warm);
  for (let specIndex = 0; specIndex < specs.length; specIndex += 1) {
    for (let boat = 0; boat < LIGHTERS_PER_SHIP; boat += 1) {
      mesh.setColorAt(
        specIndex * LIGHTERS_PER_SHIP + boat,
        specs[specIndex]!.hasLargestEvent && boat === 1 ? eventLift : ordinary,
      );
    }
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  root.add(mesh);

  const anchors = new Float32Array(specs.length * 4);
  const visible = new Uint8Array(specs.length).fill(1);
  let mix = Math.max(0, Math.min(1, initialMix));
  const dummy = new Object3D();
  const place = (index: number, x: number, y: number, z: number, yaw: number, shown = true): void => {
    if (index < 0 || index >= specs.length) return;
    anchors[index * 4] = x;
    anchors[index * 4 + 1] = y;
    anchors[index * 4 + 2] = z;
    anchors[index * 4 + 3] = yaw;
    visible[index] = shown ? 1 : 0;
  };
  let lastTimeSeconds: number | null = null;
  const flush = ({ detail, overview, reducedMotion, timeSeconds }: { detail: number; overview: boolean; reducedMotion: boolean; timeSeconds: number }): void => {
    const deltaSeconds = lastTimeSeconds === null ? 0 : Math.max(0, Math.min(0.25, timeSeconds - lastTimeSeconds));
    lastTimeSeconds = timeSeconds;
    mix = reducedMotion ? 1 : mix + (1 - mix) * (1 - Math.exp(-deltaSeconds / 45));
    const shed = Math.max(0, Math.min(1, detail));
    mesh.visible = shed > 0;
    if (!mesh.visible) return;
    let slot = 0;
    for (let specIndex = 0; specIndex < specs.length; specIndex += 1) {
      if (!visible[specIndex]) continue;
      const spec = specs[specIndex]!;
      const yaw = anchors[specIndex * 4 + 3]!;
      for (let boat = 0; boat < LIGHTERS_PER_SHIP; boat += 1) {
        const side = boat === 0 ? -1 : 1;
        const aboard = spec.activity === "minting" || (spec.activity === "balanced-active" && boat === 0);
        const along = aboard ? -0.55 : 0.55;
        const radius = spec.hullRadius + 0.7 + boat * 0.35;
        const localX = along + (stableUnit(`issuance.${spec.shipId}.${boat}`) - 0.5) * 0.25;
        const localZ = side * radius;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        dummy.position.set(
          anchors[specIndex * 4]! + localX * cos + localZ * sin,
          anchors[specIndex * 4 + 1]! - 0.48
            + (aboard ? 0.16 : -0.04),
          anchors[specIndex * 4 + 2]! - localX * sin + localZ * cos,
        );
        if (!reducedMotion && spec.eligible && (!overview || spec.overviewWork)) {
          const working = Math.sin(timeSeconds * 0.18 + specIndex * 0.7 + boat * Math.PI);
          dummy.position.y += working * 0.08 * (aboard ? 1 : -1);
        }
        dummy.rotation.set(0, yaw + (side < 0 ? Math.PI : 0), 0);
        // The second workset carries the day's largest event as a raised,
        // distinct crane lift; no event leaves it as an ordinary lighter.
        const lift = spec.hasLargestEvent && boat === 1 ? 1 : 0;
        dummy.scale.set(
          shed * mix * 0.95,
          shed * mix * (0.72 + lift * 0.58),
          shed * mix * 0.95,
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(slot, dummy.matrix);
        mesh.setColorAt(slot++, spec.hasLargestEvent && boat === 1 ? eventLift : ordinary);
      }
    }
    mesh.count = slot;
    mesh.visible = slot > 0;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  };
  flush({ detail: 1, overview: true, reducedMotion: false, timeSeconds: 0 });
  return {
    count,
    root,
    dispose() { geometry.dispose(); material.dispose(); },
    place,
    flush,
  };
}

/** Renderer helper kept here so workset membership and ordering cannot drift. */
export function issuanceWorksetShips(ships: readonly ShipVisual[]): ShipVisual[] {
  return ships.filter((visual) => shipIssuanceVisualState(visual.ship.issuance) !== null);
}
