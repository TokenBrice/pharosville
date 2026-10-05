import { Box3, DataTexture, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, ShaderLib, Vector2, Vector3, type Intersection, type IUniform } from "three";
import { afterAll, describe, expect, it, vi } from "vitest";
import { defaultCamera } from "../systems/camera";
import { isGardenShipWater } from "../systems/garden-water-exclusion";
import { cameraView, type IsoCamera } from "../systems/projection";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH } from "../systems/world-layout";
import { createGardenThreshold, writeGardenThresholdGround, type GardenThreshold, type GardenThresholdGroundSample } from "./garden-threshold";
import { gardenRimDecorativeLandAt } from "./garden-rim-mesh";
import { TILE_SCALE } from "./garden-util";
import type { GardenSurfaceAtlasLease, GardenSurfaceAtlasOwner } from "./garden-surface-atlas";
import { GARDEN_SURFACE_ROLE_ATTRIBUTE, GARDEN_SURFACE_ROLE_CODES, GARDEN_SURFACE_WEIGHT_ATTRIBUTE, type GardenSurfaceMetadata } from "./garden-surfaces";
import { GARDEN_KUROMATSU_FLEX_ATTRIBUTE, GARDEN_KUROMATSU_ROOT_INDEX_ATTRIBUTE } from "./garden-niwaki";
import { weatherForFrame } from "../systems/weather";

const GATES = [
  { width: 1600, height: 1000 },
  { width: 1200, height: 640 },
  { width: 900, height: 720 },
  { width: 720, height: 900 },
] as const;
const MAP = { width: PHAROSVILLE_MAP_WIDTH, height: PHAROSVILLE_MAP_HEIGHT };

function restCamera(gate: { width: number; height: number }, pose = defaultCamera({ ...gate, map: MAP })): PerspectiveCamera {
  const viewport = { x: gate.width, y: gate.height };
  const view = cameraView(pose, viewport);
  const camera = new PerspectiveCamera(view.vFovDeg, gate.width / gate.height, 0.1, 4000);
  camera.position.set(view.eye.x, view.eye.y, view.eye.z);
  camera.lookAt(view.target.x, view.target.y, view.target.z);
  camera.updateMatrixWorld(true);
  return camera;
}
function coveragePoses(rest: IsoCamera): { name: string; camera: IsoCamera }[] {
  const poses = [{ name: "neutral", camera: rest }];
  // The render loop's K16 contract envelope, including independent axis extrema.
  const yaw = 0.8 * Math.PI / 180;
  const pitch = 0.6 * Math.PI / 180;
  for (const sign of [-1, 1]) {
    poses.push(
      { name: `yaw ${sign}`, camera: { ...rest, breath: { yaw: sign * yaw, pitch: 0, dolly: 1 } } },
      { name: `pitch ${sign}`, camera: { ...rest, breath: { yaw: 0, pitch: sign * pitch, dolly: 1 } } },
      { name: `dolly ${sign}`, camera: { ...rest, breath: { yaw: 0, pitch: 0, dolly: 1 + sign * 0.012 } } },
    );
  }
  for (const y of [-1, 1]) for (const p of [-1, 1]) for (const d of [-1, 1]) {
    poses.push({ name: `corner ${y}/${p}/${d}`, camera: { ...rest, breath: { yaw: y * yaw, pitch: p * pitch, dolly: 1 + d * 0.012 } } });
  }
  return poses;
}



/** Coverage mask of the threshold on a W×H grid over the frame (clipped at the near plane). */
function coverage(threshold: GardenThreshold, camera: PerspectiveCamera, width: number, height: number, meshName?: string): Uint8Array {
  const mask = new Uint8Array(width * height);
  const view = camera.matrixWorldInverse;
  const instance = new Matrix4();
  threshold.root.updateMatrixWorld(true);
  threshold.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (meshName && object.name !== meshName) return;
    const matrix = object.matrixWorld.clone();
    if (object instanceof InstancedMesh) {
      object.getMatrixAt(0, instance);
      matrix.multiply(instance);
    }
    matrix.premultiply(view);
    const position = object.geometry.getAttribute("position");
    const index = object.geometry.index!;
    const local = Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix));
    for (let t = 0; t < index.count; t += 3) {
      let polygon = [local[index.getX(t)]!, local[index.getX(t + 1)]!, local[index.getX(t + 2)]!];
      if (polygon.every((p) => p.z > -0.1)) continue;
      const clipped: Vector3[] = [];
      for (let i = 0; i < 3; i += 1) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % 3]!;
        if (a.z <= -0.1) clipped.push(a);
        if ((a.z <= -0.1) !== (b.z <= -0.1)) clipped.push(a.clone().lerp(b, (-0.1 - a.z) / (b.z - a.z)));
      }
      polygon = clipped.map((p) => p.clone().applyMatrix4(camera.projectionMatrix)).map((p) => new Vector3((p.x + 1) / 2 * width, (1 - p.y) / 2 * height, 0));
      for (let k = 1; k + 1 < polygon.length; k += 1) {
        const [a, b, c] = [polygon[0]!, polygon[k]!, polygon[k + 1]!];
        const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (Math.abs(area) < 1e-9) continue;
        for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))); y <= Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y))); y += 1) {
          for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))); x <= Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x))); x += 1) {
            const w0 = ((b.x - x - 0.5) * (c.y - y - 0.5) - (b.y - y - 0.5) * (c.x - x - 0.5)) / area;
            const w1 = ((c.x - x - 0.5) * (a.y - y - 0.5) - (c.y - y - 0.5) * (a.x - x - 0.5)) / area;
            if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) mask[y * width + x] = 1;
          }
        }
      }
    }
  });
  return mask;
}

/** Failure-only trace against rendered triangles, not the authored height field. */
function thresholdCoverageEscape(threshold: GardenThreshold, ray: Raycaster): string {
  const land = threshold.root.getObjectByName("garden-threshold-land") as Mesh;
  const hits: Intersection[] = [];
  const local = new Vector3();
  const frame = (point: Vector3) => {
    local.copy(point).sub(threshold.root.position);
    return `forward=${local.dot(threshold.gravelInset.forward).toFixed(3)}, right=${local.dot(threshold.gravelInset.right).toFixed(3)}`;
  };
  const xyz = (point: Vector3) => `(${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)})`;
  Mesh.prototype.raycast.call(land, ray, hits);
  const direct = hits.sort((a, b) => a.distance - b.distance)[0];
  if (direct) return `rendered land hit at ${frame(direct.point)} world=${xyz(direct.point)}`;

  const origin = ray.ray.origin.clone().sub(threshold.root.position);
  const forwardOrigin = origin.dot(threshold.gravelInset.forward);
  const forwardDirection = ray.ray.direction.dot(threshold.gravelInset.forward);
  const point = new Vector3();
  const down = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  let closestGap = Infinity;
  let closest = "no land below the view ray";
  for (let forward = 5; forward <= 52; forward += 0.5) {
    ray.ray.at((forward - forwardOrigin) / forwardDirection, point);
    down.ray.origin.set(point.x, ray.ray.origin.y + 50, point.z);
    hits.length = 0;
    Mesh.prototype.raycast.call(land, down, hits);
    const ground = hits.sort((a, b) => a.distance - b.distance)[0];
    if (!ground) continue;
    const gap = point.y - ground.point.y;
    if (gap >= closestGap) continue;
    closestGap = gap;
    closest = `${frame(point)} ray=${xyz(point)} ground=${xyz(ground.point)} gap=${gap.toFixed(5)}`;
  }
  return `no rendered land hit; closest clearance ${closest}`;
}

describe("garden threshold (seat C)", () => {
  const threshold = createGardenThreshold();
  afterAll(() => threshold.dispose());

  it("preserves water clearance and deck coverage through the default rest hand-off and breath poses", () => {
    const posedThreshold = createGardenThreshold();
    for (const gate of GATES) {
      const rest = defaultCamera({ ...gate, map: MAP });
      const neutral = restCamera(gate, rest);
      for (const pose of coveragePoses(rest)) {
        const camera = restCamera(gate, pose.camera);
        const offset = camera.position.clone().sub(neutral.position);
        posedThreshold.setEyeOffset(offset.x, offset.y, offset.z);
        const label = `${gate.width}x${gate.height} ${pose.name}`;
        const width = 240;
        const height = Math.round(width * gate.height / gate.width);
        const mask = coverage(posedThreshold, camera, width, height);
        const hidden: string[] = [];
        for (let y = 0; y < 140; y += 1) {
          for (let x = 0; x < 140; x += 1) {
            if (!isGardenShipWater({ x, y }, 0)) continue;
            for (const hull of [0, 1.5]) {
              const screen = new Vector3(x * TILE_SCALE, hull, y * TILE_SCALE).project(camera);
              if (screen.z >= 1 || Math.abs(screen.x) >= 1 || Math.abs(screen.y) >= 1) continue;
              const px = Math.floor((screen.x + 1) / 2 * width);
              const py = Math.floor((1 - screen.y) / 2 * height);
              if (mask[py * width + px]) hidden.push(`${x},${y}@${hull}`);
            }
          }
        }
        expect(hidden, `${label} hull positions behind the threshold`).toEqual([]);

        const ray = new Raycaster();
        let outer = 0;
        const outerPixels: string[] = [];
        const escapeTraces: string[] = [];
        let tracedRow = -1;
        for (let py = Math.ceil(height * 0.75); py < height; py += 1) {
          for (let px = 0; px < width; px += 1) {
            if (mask[py * width + px]) continue;
            ray.setFromCamera(new Vector2((px + 0.5) / width * 2 - 1, 1 - (py + 0.5) / height * 2), camera);
            const k = -ray.ray.origin.y / ray.ray.direction.y;
            const tile = { x: (ray.ray.origin.x + ray.ray.direction.x * k) / TILE_SCALE, y: (ray.ray.origin.z + ray.ray.direction.z * k) / TILE_SCALE };
            const inMap = tile.x >= 0 && tile.y >= 0 && tile.x <= 139 && tile.y <= 139;
            if (!inMap && !gardenRimDecorativeLandAt(tile.x, tile.y)) {
              outer += 1;
              if (outerPixels.length < 16) outerPixels.push(`${px},${py}`);
              if (escapeTraces.length < 2 && tracedRow !== py) {
                tracedRow = py;
                escapeTraces.push(`${px},${py}: ${thresholdCoverageEscape(posedThreshold, ray)}`);
              }
            }
          }
        }
        expect(outer, `${label} outer-ocean pixels in the bottom quarter: ${outerPixels.join("; ")}\n${escapeTraces.join("\n")}`).toBe(0);
      }
    }
    posedThreshold.dispose();
  }, 30_000);

  it("keeps finite smooth-shaded, unpickable geometry within the owner's allocation", () => {
    expect(threshold.drawCallCount).toBeGreaterThan(0);
    expect(threshold.drawCallCount).toBeLessThanOrEqual(7);
    expect(threshold.triangleCount).toBeGreaterThan(0);
    expect(threshold.triangleCount).toBeLessThanOrEqual(43_000);
    const meshes: Mesh[] = [];
    threshold.root.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes.length).toBeLessThanOrEqual(7);
    let triangles = 0;
    for (const mesh of meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        expect(material).toBeInstanceOf(MeshStandardMaterial);
        expect((material as MeshStandardMaterial).flatShading, mesh.name).toBe(false);
        expect(material.transparent, mesh.name).toBe(false);
      }
      const position = mesh.geometry.getAttribute("position");
      expect(position.count, mesh.name).toBeGreaterThan(0);
      for (const name of ["position", "normal", "color"]) {
        const attribute = mesh.geometry.getAttribute(name);
        expect(attribute.count, `${mesh.name} ${name}`).toBe(position.count);
        expect(Array.from(attribute.array).every(Number.isFinite), `${mesh.name} ${name}`).toBe(true);
      }
      const index = mesh.geometry.index!;
      expect(index.count % 3, mesh.name).toBe(0);
      expect(Array.from(index.array).every((vertex) => Number.isInteger(vertex) && vertex >= 0 && vertex < position.count), mesh.name).toBe(true);
      triangles += index.count / 3 * (mesh instanceof InstancedMesh ? mesh.count : 1);
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
      const box = mesh.geometry.boundingBox!;
      const sphere = mesh.geometry.boundingSphere!;
      expect([...box.min.toArray(), ...box.max.toArray(), ...sphere.center.toArray(), sphere.radius].every(Number.isFinite), mesh.name).toBe(true);
      expect(box.isEmpty(), mesh.name).toBe(false);
      const bounds = new Box3().setFromObject(mesh);
      const target = bounds.getCenter(new Vector3());
      const eye = target.clone().add(new Vector3(0, bounds.getSize(new Vector3()).y + 10, 0));
      expect(new Raycaster(eye, target.clone().sub(eye).normalize()).intersectObject(mesh), mesh.name).toEqual([]);
    }
    expect(threshold.triangleCount).toBe(triangles);
    expect([...threshold.shadowBounds.min.toArray(), ...threshold.shadowBounds.max.toArray()].every(Number.isFinite)).toBe(true);
    expect(threshold.shadowBounds.isEmpty()).toBe(false);
  });

  it("uses one bounded mask set for continuous moss, gravel, earth and the planar reservation", () => {
    const sample: GardenThresholdGroundSample = { height: 0, moss: 0, gravel: 0, earth: 0, inset: 0 };
    for (let forward = -8; forward <= 54; forward += 0.7) {
      for (let right = -25; right <= 35; right += 0.7) {
        writeGardenThresholdGround(forward, right, sample);
        expect(Object.values(sample).every(Number.isFinite)).toBe(true);
        for (const value of [sample.moss, sample.gravel, sample.earth, sample.inset]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        expect(sample.moss + sample.gravel + sample.earth).toBeCloseTo(1, 8);
      }
    }
    const land = threshold.root.getObjectByName("garden-threshold-land") as Mesh;
    const position = land.geometry.getAttribute("position");
    const roles = land.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE);
    const weights = land.geometry.getAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE);
    const uv = land.geometry.getAttribute("uv");
    const normals = land.geometry.getAttribute("normal");
    const colors = land.geometry.getAttribute("color");
    const index = land.geometry.index!;
    const boundary = new Map<string, number>();
    const gravelFaces: number[] = [];
    const parent: number[] = [];
    const gravelVertices = new Map<string, number>();
    const root = (face: number): number => {
      while (parent[face] !== face) { parent[face] = parent[parent[face]!]!; face = parent[face]!; }
      return face;
    };
    const pointKey = (vertex: number) => `${position.getX(vertex)}|${position.getY(vertex)}|${position.getZ(vertex)}`;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      expect(weights.getX(vertex)).toBeGreaterThanOrEqual(0);
      expect(weights.getX(vertex)).toBeLessThanOrEqual(1);
      expect([uv.getX(vertex), uv.getY(vertex)].every(Number.isFinite)).toBe(true);
      if (roles.getX(vertex) === GARDEN_SURFACE_ROLE_CODES.moss && weights.getX(vertex) > 0.999) {
        const pigment = [colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex)];
        expect(Math.max(...pigment)).toBeLessThan(0.055);
        expect(Math.max(...pigment) - Math.min(...pigment)).toBeLessThan(0.025);
      }
      const key = pointKey(vertex);
      const previous = boundary.get(key);
      if (previous !== undefined) {
        expect([normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex)]).toEqual(
          [normals.getX(previous), normals.getY(previous), normals.getZ(previous)]);
        expect([colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex)]).toEqual(
          [colors.getX(previous), colors.getY(previous), colors.getZ(previous)]);
      } else boundary.set(key, vertex);
    }
    for (let face = 0; face < index.count; face += 3) {
      const a = index.getX(face), b = index.getX(face + 1), c = index.getX(face + 2);
      expect(roles.getX(a)).toBe(roles.getX(b));
      expect(roles.getX(a)).toBe(roles.getX(c));
      expect(Math.hypot(uv.getX(a) - uv.getX(b), uv.getY(a) - uv.getY(b))).toBeCloseTo(
        Math.hypot(position.getX(a) - position.getX(b), position.getZ(a) - position.getZ(b)), 4);
      if (roles.getX(a) !== GARDEN_SURFACE_ROLE_CODES.gravel) continue;
      const next = parent.length;
      parent.push(next);
      gravelFaces.push(next);
      for (const vertex of [a, b, c]) {
        const key = pointKey(vertex);
        const previous = gravelVertices.get(key);
        if (previous !== undefined) parent[root(next)] = root(previous);
        else gravelVertices.set(key, next);
      }
    }
    expect(gravelFaces.length).toBeGreaterThan(0);
    expect(new Set(gravelFaces.map(root)).size).toBe(1);
    const inset = threshold.gravelInset;
    expect(inset.width * inset.depth).toBeGreaterThan(0);
    expect(inset.right.dot(inset.forward)).toBeCloseTo(0, 8);
    let planeVertices = 0;
    const point = new Vector3();
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      point.fromBufferAttribute(position, vertex).sub(inset.centre);
      if (Math.abs(point.dot(inset.right)) > inset.width / 2 + 1e-5
        || Math.abs(point.dot(inset.forward)) > inset.depth / 2 + 1e-5) continue;
      expect(Math.abs(point.dot(inset.normal))).toBeLessThan(1e-5);
      expect(colors.getX(vertex)).toBeCloseTo(inset.pigment.r, 6);
      expect(colors.getY(vertex)).toBeCloseTo(inset.pigment.g, 6);
      expect(colors.getZ(vertex)).toBeCloseTo(inset.pigment.b, 6);
      if (Math.abs(point.dot(inset.right)) < inset.width / 2 - 1e-5
        && Math.abs(point.dot(inset.forward)) < inset.depth / 2 - 1e-5) {
        expect(roles.getX(vertex)).toBe(GARDEN_SURFACE_ROLE_CODES.gravel);
      }
      planeVertices += 1;
    }
    expect(planeVertices).toBeGreaterThan(4);
    const stonePosition = (threshold.root.getObjectByName("garden-threshold-set-stones") as Mesh).geometry.getAttribute("position");
    for (let vertex = 0; vertex < stonePosition.count; vertex += 1) {
      point.fromBufferAttribute(stonePosition, vertex).sub(inset.centre);
      expect(Math.abs(point.dot(inset.right)) > inset.width / 2
        || Math.abs(point.dot(inset.forward)) > inset.depth / 2,
      "the reserved gravel plane must remain free of decorative stones").toBe(true);
    }
  });

  it("keeps near-bank atlas footprints finite instead of collapsing shelves onto sight rays", () => {
    const land = threshold.root.getObjectByName("garden-threshold-land") as Mesh;
    const sample: GardenThresholdGroundSample = { height: 0, moss: 0, gravel: 0, earth: 0, inset: 0 };
    for (const gate of [GATES[0], GATES[2]]) {
      const camera = restCamera(gate);
      for (const substrate of [{ forward: 20, right: -5.5, repeat: 2.6, fadeEnd: 16, name: "moss" },
        { forward: 18.6, right: 1.9, repeat: 0.45, fadeEnd: 32, name: "gravel" }]) {
        writeGardenThresholdGround(substrate.forward, substrate.right, sample);
        expect(sample[substrate.name as "moss" | "gravel"]).toBeGreaterThan(0.9);
        const point = threshold.root.position.clone().addScaledVector(threshold.gravelInset.forward, substrate.forward)
          .addScaledVector(threshold.gravelInset.right, substrate.right);
        point.y += sample.height;
        const screen = point.project(camera);
        expect(Math.abs(screen.x)).toBeLessThan(1);
        expect(Math.abs(screen.y)).toBeLessThan(1);
        const pixels: Vector3[] = [];
        for (const [dx, dy] of [[0, 0], [2 / gate.width, 0], [0, -2 / gate.height]]) {
          const ray = new Raycaster();
          ray.setFromCamera(new Vector2(screen.x + dx!, screen.y + dy!), camera);
          const hits: Intersection[] = [];
          Mesh.prototype.raycast.call(land, ray, hits);
          const hit = hits.sort((a, b) => a.distance - b.distance)[0];
          expect(hit).toBeDefined();
          pixels.push(hit!.point);
        }
        const footprint = Math.max(...pixels.slice(1).map((pixel) =>
          Math.hypot(pixel.x - pixels[0]!.x, pixel.z - pixels[0]!.z))) * 124 / substrate.repeat;
        expect(footprint).toBeGreaterThan(0);
        expect(footprint, `${gate.width} ${substrate.name}: ${footprint} atlas texels/pixel`).toBeLessThan(substrate.fadeEnd);
      }
    }
  });

  it("seats unequal broad stones into the rendered terrain with dark contact and worn steps", () => {
    const land = threshold.root.getObjectByName("garden-threshold-land") as Mesh;
    const stones = threshold.root.getObjectByName("garden-threshold-set-stones") as Mesh;
    const position = stones.geometry.getAttribute("position");
    const color = stones.geometry.getAttribute("color");
    const normals = stones.geometry.getAttribute("normal");
    const index = stones.geometry.index!;
    const triad = threshold.stoneSites.filter((site) => site.form !== "flat");
    expect(triad.map((site) => site.form).sort()).toEqual(["low", "reclining", "tall"]);
    const steps = threshold.stoneSites.filter((site) => site.form === "flat");
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps.length).toBeLessThanOrEqual(6);
    for (const site of threshold.stoneSites) {
      const worldPoint = site.surfacePoint.clone().applyMatrix4(threshold.root.matrixWorld);
      const ray = new Raycaster(worldPoint.clone().add(new Vector3(0, 10, 0)), new Vector3(0, -1, 0));
      const hits: Intersection[] = [];
      Mesh.prototype.raycast.call(land, ray, hits);
      const ground = hits.reduce((top, hit) => Math.max(top, hit.point.y), -Infinity);
      expect(ground).toBeCloseTo(site.contactHeight, 4);
      const height = site.bounds.max.y - site.bounds.min.y;
      const burial = (ground - site.bounds.min.y) / height;
      expect(burial).toBeGreaterThanOrEqual(0.45);
      expect(burial).toBeLessThanOrEqual(0.5);
      expect(site.bounds.max.y - ground).toBeGreaterThanOrEqual(0.15);
      const vertices = new Set<number>();
      for (let face = site.firstTriangle * 3; face < (site.firstTriangle + site.triangleCount) * 3; face += 1) vertices.add(index.getX(face));
      const luminance = (vertex: number) => color.getX(vertex) * 0.2126 + color.getY(vertex) * 0.7152 + color.getZ(vertex) * 0.0722;
      const foot = [...vertices].filter((vertex) => position.getY(vertex) < ground + height * 0.02);
      const crown = [...vertices].filter((vertex) => position.getY(vertex) > ground + height * 0.2);
      expect(foot.length).toBeGreaterThan(0);
      expect(crown.length).toBeGreaterThan(0);
      const roundedShoulder = [...vertices].filter((vertex) => position.getY(vertex) > ground
        && normals.getY(vertex) > 0.15 && normals.getY(vertex) < 0.85);
      expect(roundedShoulder.length, `${site.form} has smooth curved shoulders, not extruded box walls`).toBeGreaterThan(3);
      expect(foot.reduce((sum, vertex) => sum + luminance(vertex), 0) / foot.length).toBeLessThan(
        crown.reduce((sum, vertex) => sum + luminance(vertex), 0) / crown.length * 0.7);
    }
    expect(threshold.root.userData).not.toHaveProperty("analyticalId");
    expect(threshold.stoneSites.every((site) => !("coinId" in site) && !("recordId" in site))).toBe(true);
  });

  it("keeps actual triad crowns exposed in the left threshold band at wide and compact seats", () => {
    const stones = threshold.root.getObjectByName("garden-threshold-set-stones") as Mesh;
    const land = threshold.root.getObjectByName("garden-threshold-land") as Mesh;
    const engawa = threshold.root.getObjectByName("garden-threshold-engawa") as Mesh;
    for (const gate of [GATES[0], GATES[2]]) {
      const camera = restCamera(gate);
      let visibleSteps = 0;
      for (const site of threshold.stoneSites) {
        const centre = site.surfacePoint.clone().applyMatrix4(threshold.root.matrixWorld);
        const down = new Raycaster(centre.clone().add(new Vector3(0, 10, 0)), new Vector3(0, -1, 0));
        const stoneHits: Intersection[] = [];
        Mesh.prototype.raycast.call(stones, down, stoneHits);
        const crown = stoneHits.filter((hit) => hit.faceIndex !== undefined && hit.faceIndex !== null
          && hit.faceIndex >= site.firstTriangle
          && hit.faceIndex < site.firstTriangle + site.triangleCount).sort((a, b) => a.distance - b.distance)[0]!;
        expect(crown, `${gate.width} ${site.form} centre has a real stone top`).toBeDefined();
        expect(crown.point.y - site.contactHeight).toBeGreaterThanOrEqual(0.15);
        const screen = crown.point.clone().project(camera);
        const u = (screen.x + 1) / 2;
        const v = (1 - screen.y) / 2;
        const ray = new Raycaster(camera.position, crown.point.clone().sub(camera.position).normalize());
        const occluders: Intersection[] = [];
        Mesh.prototype.raycast.call(land, ray, occluders);
        Mesh.prototype.raycast.call(engawa, ray, occluders);
        Mesh.prototype.raycast.call(stones, ray, occluders);
        const exposed = !occluders.some((hit) => hit.distance < camera.position.distanceTo(crown.point) - 1e-4);
        if (site.form === "flat") {
          if (exposed && u > 0 && u < 1 && v > 0 && v < 1) visibleSteps += 1;
          continue;
        }
        // Upright crowns extend above the v=.79 body band; the compact crop
        // pushes the same authored left triad toward the left viewport edge.
        expect(u).toBeGreaterThanOrEqual(gate.width === 1600 ? 0.14 : 0);
        expect(u).toBeLessThanOrEqual(0.38);
        expect(v).toBeGreaterThanOrEqual(0.7);
        expect(v).toBeLessThanOrEqual(0.91);
        expect(exposed, `${gate.width} ${site.form} crown is not buried behind the bank/deck`).toBe(true);
      }
      expect(visibleSteps).toBeGreaterThanOrEqual(4);
    }
  });

  it("hides the continuing step behind the reclining stone at both landscape gates", () => {
    const stones = threshold.root.getObjectByName("garden-threshold-set-stones") as Mesh;
    const dominant = threshold.stoneSites.find((site) => site.form === "reclining")!;
    const continuation = threshold.stoneSites[threshold.stoneSites.length - 1]!;
    const target = continuation.surfacePoint.clone().applyMatrix4(threshold.root.matrixWorld);
    for (const gate of [GATES[1], GATES[2]]) {
      const camera = restCamera(gate);
      const screen = target.clone().project(camera);
      expect(Math.abs(screen.x)).toBeLessThan(1);
      expect(Math.abs(screen.y)).toBeLessThan(1);
      const ray = new Raycaster(camera.position, target.clone().sub(camera.position).normalize());
      const hits: Intersection[] = [];
      Mesh.prototype.raycast.call(stones, ray, hits);
      expect(hits.some((hit) => hit.distance < camera.position.distanceTo(target)
        && hit.faceIndex !== undefined && hit.faceIndex !== null
        && hit.faceIndex >= dominant.firstTriangle
        && hit.faceIndex < dominant.firstTriangle + dominant.triangleCount)).toBe(true);
    }
  });

  it("leases shared detail for ground, stone and timber mappings and releases it only once", () => {
    const textures = { albedo: new DataTexture(), normal: new DataTexture(), orm: new DataTexture() };
    const dispose = Object.values(textures).map((texture) => vi.spyOn(texture, "dispose"));
    const uniforms = {
      uGardenSurfaceAlbedo: { value: textures.albedo },
      uGardenSurfaceNormal: { value: textures.normal },
      uGardenSurfaceOrm: { value: textures.orm },
      uGardenSurfaceAtlasReady: { value: 0 },
    };
    const release = vi.fn(() => Object.values(textures).forEach((texture) => texture.dispose()));
    const lease: GardenSurfaceAtlasLease = { textures, uniforms, release, ready: Promise.resolve(true), error: null,
      detailSource: { key: "threshold-test-detail", uniforms,
        glsl: "GardenSurfaceDetail gardenSampleSurface(vec3 p, vec3 n, vec2 uv, float role, float repeatMetres) { return GardenSurfaceDetail(vec3(1.0), 0.0, vec3(0.0)); }" } };
    const atlas: GardenSurfaceAtlasOwner = { textures, lease: vi.fn(() => lease), release: vi.fn() };
    const owned = createGardenThreshold(atlas);
    expect(atlas.lease).toHaveBeenCalledTimes(1);
    const mappings: string[] = [];
    owned.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const material = object.material as MeshStandardMaterial;
      const surface = material.userData.gardenSurface as GardenSurfaceMetadata | undefined;
      if (!surface) return;
      expect(surface.sourceKey).toBe(`${lease.detailSource.key}:threshold-grain-v1`);
      expect(surface.vertexRoles && surface.vertexWeights).toBe(true);
      expect(object.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE).count).toBe(object.geometry.getAttribute("position").count);
      expect(object.geometry.getAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE).count).toBe(object.geometry.getAttribute("position").count);
      const shader = { vertexShader: ShaderLib.standard.vertexShader,
        fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, IUniform> };
      material.onBeforeCompile(shader as never, null as never);
      for (const [name, uniform] of Object.entries(lease.detailSource.uniforms)) expect(shader.uniforms[name]).toBe(uniform);
      expect(shader.fragmentShader).toContain("#define gardenSampleSurface gardenSampleThresholdSurface");
      expect(shader.fragmentShader).toContain("#undef gardenSampleSurface");
      expect(shader.fragmentShader).toContain("mineral ? 0.45 : metresPerRepeat");
      expect(shader.fragmentShader).toContain("detail.normalOffset *= mineral ? 0.1 : 0.3");
      if (surface.role === "moss") {
        expect(material.envMapIntensity).toBe(0);
        expect(material.roughness).toBeGreaterThanOrEqual(0.9);
        expect(surface.detailStrength).toBe(0.78);
      }
      if (surface.role === "timber") {
        expect(shader.uniforms.uToroEmber).toBeDefined();
        expect(shader.fragmentShader).toContain("totalEmissiveRadiance += uToroEmber");
        const position = object.geometry.getAttribute("position");
        const normal = object.geometry.getAttribute("normal");
        const roles = object.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE);
        const weights = object.geometry.getAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE);
        const uv = object.geometry.getAttribute("uv");
        let timber = 0;
        let practical = 0;
        const point = new Vector3();
        const direction = new Vector3();
        for (let vertex = 0; vertex < position.count; vertex += 1) {
          if (roles.getX(vertex) !== GARDEN_SURFACE_ROLE_CODES.timber) {
            expect(weights.getX(vertex)).toBe(0);
            practical += 1;
            continue;
          }
          timber += 1;
          expect(weights.getX(vertex)).toBe(1);
          point.fromBufferAttribute(position, vertex);
          direction.fromBufferAttribute(normal, vertex);
          const top = Math.abs(direction.y) > 0.5;
          const front = Math.abs(direction.dot(owned.gravelInset.forward)) > 0.5;
          expect(uv.getX(vertex)).toBeCloseTo(point.dot(front ? owned.gravelInset.right : owned.gravelInset.forward), 4);
          expect(uv.getY(vertex)).toBeCloseTo(top ? point.dot(owned.gravelInset.right) : point.y, 4);
        }
        expect(timber).toBeGreaterThan(0);
        expect(practical).toBeGreaterThan(0);
      }
      mappings.push(`${surface.role}:${surface.mapping}`);
    });
    expect(mappings.sort()).toEqual(["moss:worldXZ", "stone:triplanar", "timber:uv"]);
    owned.dispose();
    owned.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    expect(atlas.release).not.toHaveBeenCalled();
    for (const spy of dispose) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("keeps a recognizable porous pine fragment at every seated gate", () => {
    for (const gate of GATES) {
      const width = 240;
      const height = Math.round(width * gate.height / gate.width);
      const mask = coverage(threshold, restCamera(gate), width, height, "garden-threshold-pines");
      let covered = 0;
      let area = 0;
      let gapPixels = 0, gapRows = 0;
      for (let y = 0; y < height * 0.28; y += 1) {
        let first = -1, last = -1;
        for (let x = 0; x < width * 0.24; x += 1) {
          covered += mask[y * width + x]!;
          area += 1;
          if (mask[y * width + x]) {
            if (first < 0) first = x;
            last = x;
          }
        }
        let rowGaps = 0;
        for (let x = first + 1; first >= 0 && x < last; x += 1) rowGaps += 1 - mask[y * width + x]!;
        gapPixels += rowGaps;
        if (rowGaps > 1) gapRows += 1;
      }
      const label = `${gate.width}x${gate.height} upper-left pine`;
      expect(covered, label).toBeGreaterThan(area * 0.01);
      expect(covered, `${label} clear background`).toBeLessThan(area * 0.75);
      expect(gapPixels, `${label} sky inside the actual branch envelope`).toBeGreaterThan(0);
      expect(gapRows, `${label} separated sprays across mesh rows`).toBeGreaterThan(2);
      let obscured = 0;
      for (let y = Math.ceil(height * 0.05); y < height * 0.7; y += 1) {
        for (let x = Math.ceil(width * 0.42); x < width * 0.9; x += 1) obscured += mask[y * width + x]!;
      }
      expect(obscured, `${gate.width} pine leaves the tower/crown/inlet clear`).toBe(0);
    }
  });

  it("bakes two rooted trees with cached rest positions and a zero-displacement reduced frame", () => {
    const owned = createGardenThreshold();
    try {
      const pines = owned.root.getObjectByName("garden-threshold-pines") as InstancedMesh;
      const material = pines.material as MeshStandardMaterial;
      const position = pines.geometry.getAttribute("position");
      const flex = pines.geometry.getAttribute(GARDEN_KUROMATSU_FLEX_ATTRIBUTE);
      const rootIndex = pines.geometry.getAttribute(GARDEN_KUROMATSU_ROOT_INDEX_ATTRIBUTE);
      expect(flex.itemSize).toBe(3);
      expect(flex.count).toBe(position.count);
      expect(rootIndex.itemSize).toBe(1);
      expect(rootIndex.count).toBe(position.count);
      expect([...new Set(rootIndex.array)]).toEqual([0, 1]);
      expect(Array.from(flex.array).every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
      const instance = new Matrix4();
      pines.getMatrixAt(0, instance);
      const toWorld = pines.matrixWorld.clone().multiply(instance);
      for (const tree of [0, 1] as const) {
        const ring = new Map<string, Vector3>();
        for (let vertex = 0; vertex < position.count; vertex += 1) {
          if (rootIndex.getX(vertex) !== tree || flex.getX(vertex) !== 0 || flex.getY(vertex) !== 0 || flex.getZ(vertex) !== 0) continue;
          const point = new Vector3().fromBufferAttribute(position, vertex).applyMatrix4(toWorld);
          ring.set(point.toArray().map((value) => value.toFixed(5)).join("/"), point);
        }
        expect(ring.size).toBeGreaterThan(2);
        const centre = new Vector3();
        for (const point of ring.values()) centre.add(point);
        centre.divideScalar(ring.size);
        expect(centre.distanceTo(owned.pineRestRoots[tree])).toBeLessThan(1e-5);
      }
      const roots = owned.pineRestRoots;
      const restPositions = roots.map((point) => point.clone());
      const before = Array.from(position.array);
      const weather = weatherForFrame({ baseWind: 0.5, psiStress: 0.2, timeSeconds: 2 });
      owned.updateWind(weather, false, 0.2, 0.7);
      const uniforms = material.userData.gardenRootedWindUniforms as {
        uGardenWindStrength: IUniform<number>, uGardenRootGust0: IUniform<number>, uGardenRootGust1: IUniform<number>,
      };
      expect(uniforms.uGardenWindStrength.value).toBeGreaterThan(0);
      expect(uniforms.uGardenRootGust0.value).toBe(0.2);
      expect(uniforms.uGardenRootGust1.value).toBe(0.7);
      owned.updateWind(weather, true, 0.2, 0.7);
      expect(uniforms.uGardenWindStrength.value).toBe(0);
      expect(uniforms.uGardenRootGust0.value).toBe(0);
      expect(uniforms.uGardenRootGust1.value).toBe(0);
      expect(pines.geometry.hasAttribute("aGardenSway")).toBe(false);
      owned.setEyeOffset(0.1, 0.2, -0.1);
      expect(owned.pineRestRoots).toBe(roots);
      for (const tree of [0, 1] as const) expect(roots[tree].equals(restPositions[tree]!)).toBe(true);
      expect(Array.from(position.array)).toEqual(before);
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      const shader = { vertexShader: ShaderLib.standard.vertexShader,
        fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, IUniform> };
      material.onBeforeCompile(shader as never, null as never);
      expect(shader.vertexShader).toContain("attribute vec3 aGardenFlex;");
      expect(shader.vertexShader).toContain("dot(clamp(aGardenFlex, 0.0, 1.0), vec3(0.2, 0.45, 0.35))");
      expect(shader.vertexShader).toContain("attribute float aGardenRootIndex;");
      expect(shader.vertexShader).not.toContain("gardenWindHeight");
      expect(shader.uniforms.uGardenWindStrength).toBe(uniforms.uGardenWindStrength);
      expect(material.customProgramCacheKey()).toContain("garden-rooted-wind-sway-v1");
    } finally {
      owned.dispose();
    }
  });

  it("settles deterministically without waiting for wind or loading", () => {
    const second = createGardenThreshold();
    const geometry = (garden: GardenThreshold) => {
      const arrays: number[][] = [];
      garden.root.traverse((object) => {
        if (object instanceof Mesh) arrays.push(Array.from(object.geometry.getAttribute("position").array));
      });
      return arrays;
    };
    expect(geometry(second)).toEqual(geometry(threshold));
    expect(second.shadowBounds.equals(threshold.shadowBounds)).toBe(true);
    second.dispose();
  });

  it("releases all threshold resources once", () => {
    const owned = createGardenThreshold();
    const parent = new Group();
    parent.add(owned.root);
    const disposed = new Map<object, number>();
    owned.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const resource of [object.geometry, object.material as MeshStandardMaterial]) {
        disposed.set(resource, 0);
        resource.addEventListener("dispose", () => disposed.set(resource, disposed.get(resource)! + 1));
      }
    });
    owned.dispose();
    owned.dispose();
    expect(disposed.size).toBeGreaterThan(0);
    expect([...disposed.values()].every((count) => count === 1)).toBe(true);
    expect(owned.root.parent).toBeNull();
    expect(owned.root.children).toEqual([]);
    expect(parent.children).toEqual([]);
  });
});
