import { Box3, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Texture, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { defaultCamera } from "../systems/camera";
import { GARDEN_ARRIVAL_DURATION_MS, sampleGardenArrival } from "../systems/garden-arrival";
import { isGardenShipWater } from "../systems/garden-water-exclusion";
import { cameraView, type IsoCamera } from "../systems/projection";
import { REST_SEAT_EYE_HEIGHT } from "../systems/rest-seat";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH } from "../systems/world-layout";
import { createGardenThreshold, shapeThresholdLimbPads, type GardenThreshold } from "./garden-threshold";
import { createNiwakiPine, type NiwakiPine } from "./garden-niwaki";
import { gardenRimDecorativeLandAt } from "./garden-rim-mesh";
import { TILE_SCALE } from "./garden-util";

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
  for (const progress of [0, 0.5, 1]) {
    poses.push({ name: `arrival ${progress}`, camera: sampleGardenArrival(rest, progress * GARDEN_ARRIVAL_DURATION_MS).camera });
  }
  return poses;
}

const TEST_AZIMUTH = 0.73;
function contourPine(): NiwakiPine {
  return createNiwakiPine({
    seed: "threshold.contour-test",
    height: 9,
    branches: [
      { at: 0.3, azimuth: TEST_AZIMUTH, reach: 4, rise: 0.2, padSize: 0.7, detail: 2, padsAt: [
        { forward: 1, side: 0.1, up: 1.2, size: 0.8 },
        { forward: 2.5, side: -0.2, up: 0.3, size: 0.6 },
        { forward: 4, side: 0.2, up: 0.7, size: 0.7 },
      ] },
      { at: 0.7, azimuth: 2.4, reach: 2, rise: 0.2, padSize: 1 },
    ],
  });
}

function branchZeroOwners(pine: NiwakiPine): number[] {
  return pine.pads.map((pad, owner) => ({ pad, owner })).filter(({ pad }) => pad.branch === 0)
    .sort((a, b) => (a.pad.center.x - b.pad.center.x) * Math.cos(TEST_AZIMUTH)
      + (a.pad.center.z - b.pad.center.z) * Math.sin(TEST_AZIMUTH))
    .map(({ owner }) => owner);
}

function localPadPoint(pine: NiwakiPine, vertex: number, positions: ArrayLike<number>): Vector3 {
  const pad = pine.pads[pine.padOfVertex[vertex]!]!;
  const x = positions[vertex * 3]! - pad.center.x;
  const z = positions[vertex * 3 + 2]! - pad.center.z;
  return new Vector3(
    (Math.cos(TEST_AZIMUTH) * x + Math.sin(TEST_AZIMUTH) * z) / pad.halfSize.x,
    positions[vertex * 3 + 1]!,
    (-Math.sin(TEST_AZIMUTH) * x + Math.cos(TEST_AZIMUTH) * z) / pad.halfSize.z,
  );
}


/** Coverage mask of the threshold on a W×H grid over the frame (clipped at the near plane). */
function coverage(threshold: GardenThreshold, camera: PerspectiveCamera, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const view = camera.matrixWorldInverse;
  const instance = new Matrix4();
  threshold.root.updateMatrixWorld(true);
  threshold.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
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

describe("garden threshold (seat C)", () => {
  const threshold = createGardenThreshold();

  it("preserves water clearance and deck coverage through rest breath and arrival poses", () => {
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
        // The original bank exposes outer sea during the lowered arrival shot.
        // Hull clearance still applies there; full deck coverage starts at the seated hand-off.
        if (pose.camera.shot) continue;

        const ray = new Raycaster();
        let outer = 0;
        for (let py = Math.ceil(height * 0.75); py < height; py += 1) {
          for (let px = 0; px < width; px += 1) {
            if (mask[py * width + px]) continue;
            ray.setFromCamera(new Vector2((px + 0.5) / width * 2 - 1, 1 - (py + 0.5) / height * 2), camera);
            const k = -ray.ray.origin.y / ray.ray.direction.y;
            const tile = { x: (ray.ray.origin.x + ray.ray.direction.x * k) / TILE_SCALE, y: (ray.ray.origin.z + ray.ray.direction.z * k) / TILE_SCALE };
            const inMap = tile.x >= 0 && tile.y >= 0 && tile.x <= 139 && tile.y <= 139;
            if (!inMap && !gardenRimDecorativeLandAt(tile.x, tile.y)) outer += 1;
          }
        }
        expect(outer, `${label} outer-ocean pixels in the bottom quarter`).toBe(0);
      }
    }
    posedThreshold.dispose();
  }, 30_000);

  it("shows the hero's lowest limb pad from below across the upper-left edge (landscape)", () => {
    const camera = restCamera(GATES[0]);
    const pad = threshold.heroLimbPadCentres[threshold.heroLimbPadCentres.length - 1]!;
    expect(pad.y).toBeGreaterThan(REST_SEAT_EYE_HEIGHT);
    const screen = pad.clone().project(camera);
    const u = (screen.x + 1) / 2;
    const v = (1 - screen.y) / 2;
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(0.15);
    expect(v).toBeGreaterThan(0.1);
    expect(v).toBeLessThan(0.26);
  });

  it("keeps to three smooth-shaded, textureless, unpickable draws within 15k triangles", () => {
    expect(threshold.drawCallCount).toBe(3);
    expect(threshold.triangleCount).toBeLessThanOrEqual(15_000);
    const meshes: Mesh[] = [];
    threshold.root.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(3);
    expect(new Set(meshes.map((mesh) => mesh.material)).size).toBe(3);
    const instances = meshes.filter((mesh) => mesh instanceof InstancedMesh);
    expect(instances).toHaveLength(1);
    expect((instances[0] as InstancedMesh).count).toBe(1);
    for (const mesh of meshes) {
      const material = mesh.material as MeshStandardMaterial;
      expect(Object.values(material).filter((value) => value instanceof Texture), mesh.name).toEqual([]);
      const position = mesh.geometry.getAttribute("position");
      for (const name of ["position", "normal", "color"]) {
        const attribute = mesh.geometry.getAttribute(name);
        expect(attribute.count, `${mesh.name} ${name}`).toBe(position.count);
        expect(Array.from(attribute.array).every(Number.isFinite), `${mesh.name} ${name}`).toBe(true);
      }
      expect(Array.from(mesh.geometry.index!.array).every((index) => index >= 0 && index < position.count), mesh.name).toBe(true);
      const bounds = new Box3().setFromObject(mesh);
      const target = bounds.getCenter(new Vector3());
      const eye = target.clone().add(new Vector3(0, bounds.getSize(new Vector3()).y + 10, 0));
      expect(new Raycaster(eye, target.clone().sub(eye).normalize()).intersectObject(mesh), mesh.name).toEqual([]);
      expect(material.flatShading, mesh.name).toBe(false);
      expect(mesh.castShadow && mesh.receiveShadow, mesh.name).toBe(true);
    }
  });

  it("shapes only branch-zero threshold pads and preserves all other vertex attributes", () => {
    const pine = contourPine();
    const geometry = pine.geometry;
    const attributes = { ...geometry.attributes };
    const before = Object.fromEntries(Object.entries(attributes).map(([name, attribute]) => [name, Array.from(attribute.array)]));
    const index = geometry.index;
    const indices = Array.from(index!.array);
    const ownership = pine.padOfVertex.slice();
    const metadata = pine.pads.map((pad) => ({ center: pad.center.toArray(), half: pad.halfSize.toArray(), branch: pad.branch }));
    const trunk = pine.trunk.getPoints(20).map((point) => point.toArray());
    const owners = branchZeroOwners(pine);
    expect(owners).toHaveLength(3);
    // Deliberately different from the generator's height-sorted metadata order.
    expect(owners).not.toEqual(pine.pads.map((pad, owner) => ({ pad, owner })).filter(({ pad }) => pad.branch === 0).map(({ owner }) => owner));
    shapeThresholdLimbPads(pine, TEST_AZIMUTH, [
      { crownHeight: 1, crownPhase: 0, cuts: [{ angle: 0, halfWidth: 1.3, depth: 0.3 }] },
      { crownHeight: 1, crownPhase: 0, cuts: [] }, { crownHeight: 1, crownPhase: 0, cuts: [] },
    ]);
    for (const [name, attribute] of Object.entries(attributes)) expect(geometry.getAttribute(name)).toBe(attribute);
    expect(geometry.index).toBe(index);
    expect(Array.from(index!.array)).toEqual(indices);
    expect(pine.padOfVertex).toEqual(ownership);
    expect(pine.pads.map((pad) => ({ center: pad.center.toArray(), half: pad.halfSize.toArray(), branch: pad.branch }))).toEqual(metadata);
    expect(pine.trunk.getPoints(20).map((point) => point.toArray())).toEqual(trunk);
    expect(Array.from(attributes.color!.array)).toEqual(before.color);
    const movedOwners = new Set<number>();
    let unchangedRegion = 0;
    let changedNormals = 0;
    for (let vertex = 0; vertex < ownership.length; vertex += 1) {
      const start = vertex * 3;
      const owner = ownership[vertex]!;
      const oldPosition = before.position!.slice(start, start + 3);
      const newPosition = Array.from(attributes.position!.array.slice(start, start + 3));
      expect(newPosition[1]).toBe(oldPosition[1]);
      if (!owners.includes(owner)) {
        expect(newPosition).toEqual(oldPosition);
        expect(Array.from(attributes.normal!.array.slice(start, start + 3))).toEqual(before.normal!.slice(start, start + 3));
      } else if (owner === owners[0]) {
        if (newPosition.some((value, i) => value !== oldPosition[i])) movedOwners.add(owner);
        const local = localPadPoint(pine, vertex, before.position!);
        if (Math.abs(Math.atan2(local.z, local.x)) > 1.3) {
          expect(newPosition).toEqual(oldPosition);
          unchangedRegion += 1;
        }
        if (Array.from(attributes.normal!.array.slice(start, start + 3)).some((value, i) => value !== before.normal![start + i])) changedNormals += 1;
      } else expect(newPosition).toEqual(oldPosition);
    }
    expect([...movedOwners]).toEqual([owners[0]]);
    expect(unchangedRegion).toBeGreaterThan(0);
    expect(changedNormals).toBeGreaterThan(0);
    geometry.dispose();
  });

  it("keeps contracted contours inside the authored crown with finite oriented triangles", () => {
    const pine = contourPine();
    const position = pine.geometry.getAttribute("position");
    const before = Array.from(position.array);
    pine.geometry.computeBoundingBox();
    const bounds = pine.geometry.boundingBox!.clone();
    const metadata = pine.pads.map((pad) => ({ center: pad.center.toArray(), half: pad.halfSize.toArray() }));
    const owners = branchZeroOwners(pine);
    const cuts = [{ angle: Math.PI - 0.08, halfWidth: 1.2, depth: 0.3 }, { angle: -Math.PI + 0.15, halfWidth: 1, depth: 0.26 }];
    shapeThresholdLimbPads(pine, TEST_AZIMUTH, owners.map((_, crownPhase) => ({ cuts, crownHeight: 0.6, crownPhase })));
    let acrossWrap = 0;
    const supports = new Map(owners.map((owner) => [owner, { old: Infinity, next: Infinity }]));
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      if (!owners.includes(pine.padOfVertex[vertex]!)) continue;
      const old = localPadPoint(pine, vertex, before);
      const next = localPadPoint(pine, vertex, position.array);
      const support = supports.get(pine.padOfVertex[vertex]!)!;
      support.old = Math.min(support.old, old.x);
      support.next = Math.min(support.next, next.x);
      expect(Math.abs(next.x)).toBeLessThanOrEqual(Math.abs(old.x) + 1e-6);
      expect(Math.abs(next.z)).toBeLessThanOrEqual(Math.abs(old.z) + 1e-6);
      const base = pine.pads[pine.padOfVertex[vertex]!]!.center.y - pine.pads[pine.padOfVertex[vertex]!]!.halfSize.y;
      const height = old.y - base;
      if (height <= 1e-6) expect(next.y).toBe(old.y);
      else {
        expect(next.y).toBeGreaterThanOrEqual(base + height * 0.55);
        expect(next.y).toBeLessThanOrEqual(base + height * 0.65);
      }
      const angle = Math.atan2(old.z, old.x);
      if (Math.abs(angle) > Math.PI - 0.3) {
        expect(Math.hypot(next.x, next.z)).toBeLessThan(Math.hypot(old.x, old.z));
        acrossWrap |= angle < 0 ? 1 : 2;
      }
    }
    expect(acrossWrap).toBe(3);
    for (const support of supports.values()) expect(support.next).toBeGreaterThan(support.old);
    expect(bounds.containsBox(pine.geometry.boundingBox!)).toBe(true);
    expect(pine.pads.map((pad) => ({ center: pad.center.toArray(), half: pad.halfSize.toArray() }))).toEqual(metadata);
    const index = pine.geometry.index!;
    const faceNormal = (face: number, positions: ArrayLike<number>) => {
      const a = new Vector3().fromArray(positions, index.getX(face) * 3);
      const b = new Vector3().fromArray(positions, index.getX(face + 1) * 3);
      const c = new Vector3().fromArray(positions, index.getX(face + 2) * 3);
      return c.sub(b).cross(a.sub(b));
    };
    for (let face = 0; face < index.count; face += 3) {
      if (!owners.includes(pine.padOfVertex[index.getX(face)]!)) continue;
      const old = faceNormal(face, before);
      if (old.lengthSq() < 1e-14) continue; // Existing clamped-base degeneracies.
      const next = faceNormal(face, position.array);
      expect(next.lengthSq()).toBeGreaterThan(old.lengthSq() * 0.01);
      expect(next.dot(old)).toBeGreaterThan(0);
    }
    expect(Array.from(pine.geometry.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
    expect([...pine.geometry.boundingBox!.min.toArray(), ...pine.geometry.boundingBox!.max.toArray(), ...pine.geometry.boundingSphere!.center.toArray(), pine.geometry.boundingSphere!.radius].every(Number.isFinite)).toBe(true);
    pine.geometry.dispose();
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
    expect([...disposed.values()]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(owned.root.parent).toBeNull();
    expect(owned.root.children).toEqual([]);
    expect(parent.children).toEqual([]);
  });
});
