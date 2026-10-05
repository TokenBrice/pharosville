import { Box3, Ray, Vector3, type BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGardenOkiDoro,
  buildGardenRoof,
  buildGardenTimberBay,
  buildGardenVeranda,
  type GardenArchitectureKit,
  type GardenRoofProfile,
} from "./garden-architecture-kit";
import { GARDEN_SURFACE_ROLE_ATTRIBUTE, GARDEN_SURFACE_ROLE_CODES } from "./garden-surfaces";
import { STATION_SCALE_LADDER, stationScaleFor, type StationType } from "../systems/dock-layout";

const PROFILES: GardenRoofProfile[] = ["irimoya", "hip", "gable", "mono-pitch"];
const ROOF = { length: 6.37, span: 3.83, eaveY: 2.6, ridgeY: 4.7 };
const FRAME = { length: 6.37, span: 3.83, floorY: 0.4, eaveY: 2.6, bayLength: 1.8 };
const liveKits: GardenArchitectureKit[] = [];

function own(kit: GardenArchitectureKit): GardenArchitectureKit {
  liveKits.push(kit);
  return kit;
}
function bounds(kit: GardenArchitectureKit): Box3 {
  const box = new Box3();
  for (const part of kit.parts) box.union(part.geometry.boundingBox!);
  return box;
}
function rayHits(geometry: BufferGeometry, origin: Vector3, direction: Vector3): Vector3[] {
  const ray = new Ray(origin, direction), hits: Vector3[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    if (ray.intersectTriangle(a, b, c, false, hit)) hits.push(hit.clone());
  }
  return hits.sort((left, right) => left.distanceToSquared(origin) - right.distanceToSquared(origin));
}
function roofHeight(kit: GardenArchitectureKit, x: number, z: number): number {
  const field = kit.parts.find((part) => part.name === "roof-field")!;
  const hits = rayHits(field.geometry, new Vector3(x, 100, z), new Vector3(0, -1, 0));
  expect(hits.length).toBeGreaterThan(0);
  return hits[0].y;
}

// Every fixture is caller-owned, including fixtures built in a failing assertion.
afterEach(() => {
  for (const kit of liveKits) for (const part of kit.parts) part.geometry.dispose();
  liveKits.length = 0;
});

describe("pure roof-led architecture kit", () => {
  it.each(PROFILES)("authors deterministic %s geometry without shared ownership", (profile) => {
    const factories = [
      () => buildGardenRoof({ ...ROOF, profile }),
      () => buildGardenTimberBay(FRAME),
      () => buildGardenVeranda({ ...ROOF, profile, deckY: 0.4 }),
      () => buildGardenOkiDoro(),
    ];
    for (const factory of factories) {
      const a = own(factory()), b = own(factory());
      expect(a.anchors).toEqual(b.anchors);
      expect(a.bays).toEqual(b.bays);
      expect(a.apertures).toEqual(b.apertures);
      expect(a.parts.length).toBe(b.parts.length);
      for (let i = 0; i < a.parts.length; i += 1) {
        const left = a.parts[i], right = b.parts[i];
        expect(left.geometry).not.toBe(right.geometry);
        expect(left.bucket).toBe(right.bucket);
        expect(left.role).toBe(right.role);
        expect(left.name).toBe(right.name);
        expect(Object.keys(left.geometry.attributes).sort()).toEqual([GARDEN_SURFACE_ROLE_ATTRIBUTE, "normal", "position", "uv"].sort());
        for (const attribute of Object.keys(left.geometry.attributes)) {
          expect(left.geometry.getAttribute(attribute).array).not.toBe(right.geometry.getAttribute(attribute).array);
          expect(left.geometry.getAttribute(attribute).array).toEqual(right.geometry.getAttribute(attribute).array);
        }
      }
    }
  });

  it("covers every vertex with finite unit normals, metric UVs and the canonical surface role", () => {
    const kits = [
      ...PROFILES.map((profile) => own(buildGardenRoof({ ...ROOF, profile }))),
      own(buildGardenTimberBay(FRAME)),
      own(buildGardenVeranda({ ...ROOF, deckY: 0.4 })),
      own(buildGardenOkiDoro()),
    ];
    expect([...new Set(kits.flatMap((kit) => kit.parts.map((part) => part.role)))].sort()).toEqual(["plaster", "roofTile", "stone", "timber"]);
    for (const kit of kits) for (const part of kit.parts) {
      const position = part.geometry.getAttribute("position"), normal = part.geometry.getAttribute("normal");
      const uv = part.geometry.getAttribute("uv"), roles = part.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE);
      expect(position.count).toBeGreaterThan(0);
      expect(position.count % 3).toBe(0);
      expect(normal.count).toBe(position.count);
      expect(uv.count).toBe(position.count);
      expect(roles.count).toBe(position.count);
      expect(roles.itemSize).toBe(1);
      for (const attribute of [position, normal, uv, roles]) expect(Array.from(attribute.array).every(Number.isFinite), part.name).toBe(true);
      for (let i = 0; i < position.count; i += 1) {
        expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)), part.name).toBeCloseTo(1, 5);
        expect(roles.getX(i), part.name).toBe(GARDEN_SURFACE_ROLE_CODES[part.role]);
      }
    }
    const posts = kits[4].parts[0].geometry;
    const p = posts.getAttribute("position"), n = posts.getAttribute("normal"), uv = posts.getAttribute("uv");
    // First member is an upright: grain runs in U along its metric Y, never a 0..1 box stretch.
    for (let i = 0; i < 36; i += 1) if (Math.abs(n.getY(i)) < 0.1) expect(uv.getX(i)).toBeCloseTo(p.getY(i), 6);
    const field = kits[0].parts[0].geometry;
    const roofUV = field.getAttribute("uv"), roofP = field.getAttribute("position"), roofN = field.getAttribute("normal");
    for (let i = 0; i < roofP.count; i += 1) if (roofN.getY(i) > 0.1 && Math.abs(roofN.getX(i)) < 0.01) expect(roofUV.getX(i)).toBeCloseTo(roofP.getX(i), 6);
  });

  it.each(PROFILES)("keeps %s outer dimensions exact and heights independent of frontage", (profile) => {
    for (const length of [3.19, 6.37, 9.91]) for (const span of [2.21, 3.83, 5.03]) {
      const kit = own(buildGardenRoof({ ...ROOF, length, span, profile })), box = bounds(kit);
      expect(box.min.x).toBeCloseTo(-length / 2, 5);
      expect(box.max.x).toBeCloseTo(length / 2, 5);
      expect(box.min.z).toBeCloseTo(-span / 2, 5);
      expect(box.max.z).toBeCloseTo(span / 2, 5);
      expect(box.max.y).toBeCloseTo(ROOF.ridgeY + 0.08, 5);
      expect(kit.anchors.ridge?.[1]).toBeCloseTo(box.max.y, 5);
      expect(kit.anchors.eaves).toHaveLength(4);
      expect(roofHeight(kit, 0, span / 2 - 0.001)).toBeCloseTo(ROOF.eaveY, 2);
    }
  });

  it("samples distinct hip, gable and irimoya fields with sag, thickness and readable rafters", () => {
    const kits = PROFILES.map((profile) => own(buildGardenRoof({ ...ROOF, profile })));
    const hz = ROOF.span / 2, rise = ROOF.ridgeY - ROOF.eaveY;
    for (const kit of kits.slice(0, 3)) {
      const sampled = roofHeight(kit, 0, hz * 0.52);
      expect(sampled).toBeLessThan(ROOF.eaveY + rise * 0.48 - 0.01);
      expect(sampled).toBeGreaterThan(ROOF.eaveY + rise * 0.48 - 0.05);
      const field = kit.parts[0].geometry;
      const hits = rayHits(field, new Vector3(0.1, 100, hz * 0.7), new Vector3(0, -1, 0));
      expect(hits[0].y - hits[hits.length - 1].y).toBeCloseTo(0.14, 5);
      const rafters = kit.parts.find((part) => part.name === "underside-rafters")!.geometry;
      expect(rafters.boundingBox!.min.y).toBeLessThan(ROOF.eaveY - 0.14);
      expect(rafters.boundingBox!.max.y).toBeLessThan(ROOF.ridgeY - 0.14 + 0.001);
      const positions = rafters.getAttribute("position"), normals = rafters.getAttribute("normal");
      expect(Array.from({ length: positions.count }, (_, i) => normals.getY(i)).some((y) => y < -0.5)).toBe(true);
    }
    const x = ROOF.length / 2 - 0.2;
    const hip = roofHeight(kits[1], x, 0), gable = roofHeight(kits[2], x, 0);
    expect(gable - hip).toBeGreaterThan(1);
    // The irimoya gable is inset: the skirt remains low past its upper gable plane.
    const irimoya = roofHeight(kits[0], x, 0);
    expect(irimoya).toBeLessThan(ROOF.eaveY + rise * 0.48);
    expect(hip - irimoya).toBeGreaterThan(0.1);
    expect(roofHeight(kits[3], 0, -hz + 0.001)).toBeCloseTo(ROOF.ridgeY, 2);
  });

  it("retains default rafters and permits a bounded fixed station spacing", () => {
    for (const profile of PROFILES) for (const length of [3.5, 14.2, 24, 100]) {
      const defaults = own(buildGardenRoof({ ...ROOF, length, profile }));
      const explicit = own(buildGardenRoof({ ...ROOF, length, profile, rafterSpacing: 0.8 }));
      const spaced = own(buildGardenRoof({ ...ROOF, length, profile, rafterSpacing: 2 }));
      const rafters = (kit: GardenArchitectureKit) => kit.parts.find((part) => part.name === "underside-rafters")!.geometry;
      expect(rafters(defaults).getAttribute("position").array).toEqual(rafters(explicit).getAttribute("position").array);
      const perRafter = profile === "mono-pitch" ? 24 : 48;
      expect(rafters(spaced).getAttribute("position").count / 3).toBe(Math.min(12, Math.max(2, Math.ceil(length / 2))) * perRafter);
      expect(bounds(spaced)).toEqual(bounds(defaults));
    }
    for (const rafterSpacing of [0, -1, NaN, Infinity]) {
      expect(() => buildGardenRoof({ ...ROOF, rafterSpacing })).toThrow(RangeError);
    }
  });

  it("omits only buried rafter backs while retaining continuous sides and exposed end caps", () => {
    for (const profile of PROFILES) {
      const kit = own(buildGardenRoof({ ...ROOF, profile, rafterSpacing: 2, buriedRafterBack: true }));
      const rafters = kit.parts.find((part) => part.name === "underside-rafters")!.geometry;
      const positions = rafters.getAttribute("position"), normals = rafters.getAttribute("normal");
      const count = Math.min(12, Math.max(2, Math.ceil(ROOF.length / 2)));
      expect(rafters.boundingBox!.min.y).toBeLessThan(ROOF.eaveY - 0.14);
      expect(rafters.boundingBox!.max.y).toBeLessThan(ROOF.ridgeY - 0.11);
      expect(positions.count / 3).toBe(count * (profile === "mono-pitch" ? 16 : 32));
      for (let i = 0; i < positions.count; i += 1) {
        const shellTop = roofHeight(kit, positions.getX(i), positions.getZ(i));
        const gap = shellTop - positions.getY(i);
        // Back vertices embed 2 cm into the 14 cm shell; underside stays 7 cm below it.
        expect(Math.min(Math.abs(gap - 0.12), Math.abs(gap - 0.21))).toBeLessThan(0.00002);
        expect(normals.getY(i)).toBeLessThanOrEqual(0.00001);
        expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 5);
      }
      expect(Array.from({ length: normals.count }, (_, i) => normals.getY(i)).some((y) => y < -0.4)).toBe(true);
      expect(Array.from({ length: normals.count }, (_, i) => Math.abs(normals.getZ(i))).some((z) => z > 0.9)).toBe(true);
    }
  });

  it("fits end bays without stretching the nominal interiors, post joinery or heights", () => {
    for (const length of [1.39, 3.19, 6.37, 9.91]) for (const span of [2.21, 3.83, 5.03]) {
      const kit = own(buildGardenTimberBay({ ...FRAME, length, span, door: false })), box = bounds(kit);
      expect(Object.hasOwn(kit.anchors, "door")).toBe(false);
      expect(box.min.x).toBeCloseTo(-length / 2, 5);
      expect(box.max.x).toBeCloseTo(length / 2, 5);
      expect(box.min.z).toBeCloseTo(-span / 2, 5);
      expect(box.max.z).toBeCloseTo(span / 2, 5);
      expect(box.min.y).toBeCloseTo(FRAME.floorY, 5);
      expect(box.max.y).toBeCloseTo(FRAME.eaveY, 5);
      const bays = kit.bays!;
      expect(bays[0].from).toBeCloseTo(-(length - 0.16) / 2, 10);
      expect(bays[bays.length - 1].to).toBeCloseTo((length - 0.16) / 2, 10);
      for (let i = 1; i < bays.length - 1; i += 1) {
        expect(bays[i].fitted).toBe(false);
        expect(bays[i].to - bays[i].from).toBeCloseTo(1.8, 10);
        expect(bays[i].from).toBe(bays[i - 1].to);
      }
      expect(bays[0].to - bays[0].from).toBeCloseTo(bays[bays.length - 1].to - bays[bays.length - 1].from, 10);
      const post = kit.parts[0].geometry.getAttribute("position");
      const first = new Box3();
      for (let i = 0; i < 36; i += 1) first.expandByPoint(new Vector3().fromBufferAttribute(post, i));
      expect(first.max.x - first.min.x).toBeCloseTo(0.16, 5);
      expect(first.max.z - first.min.z).toBeCloseTo(0.16, 5);
      expect(first.max.y - first.min.y).toBeCloseTo(FRAME.eaveY - FRAME.floorY, 5);
    }
  });

  it("recesses plaster behind timber while keeping the fitted door truly open down to the deck", () => {
    const kit = own(buildGardenTimberBay({ ...FRAME, door: { width: 0.72, height: 1.7 } }));
    const door = kit.anchors.door!;
    expect(kit.anchors.deck).toEqual([0, FRAME.floorY, 0]);
    expect(kit.apertures[0].kind).toBe("door");
    expect(kit.apertures[0].max[0] - kit.apertures[0].min[0]).toBeCloseTo(0.72, 8);
    for (const dx of [-0.3, 0, 0.3]) for (const height of [0.02, 0.6, 1.6]) {
      const origin = new Vector3(door[0] + dx, door[1] + height, door[2] + 0.2);
      for (const part of kit.parts) expect(rayHits(part.geometry, origin, new Vector3(0, 0, -1)).filter((hit) => origin.z - hit.z < 0.5)).toEqual([]);
    }
    const timber = kit.parts[0].geometry, plaster = kit.parts[1].geometry;
    const origin = new Vector3(kit.bays![0].from + 0.4, 1.4, FRAME.span / 2 + 0.2);
    const plasterHit = rayHits(plaster, origin, new Vector3(0, 0, -1))[0];
    expect(plasterHit.z).toBeLessThan(FRAME.span / 2 - 0.09);
    const postHit = rayHits(timber, new Vector3(kit.bays![0].from, 1.4, origin.z), new Vector3(0, 0, -1))[0];
    expect(postHit.z).toBeCloseTo(FRAME.span / 2, 5);
  });

  it("authors an open boarded veranda with a usable lower tread and exported roof/deck anchors", () => {
    const kit = own(buildGardenVeranda({ ...ROOF, deckY: 0.4 })), box = bounds(kit);
    expect(kit.parts.every((part) => part.role !== "plaster")).toBe(true);
    expect(box.max.x - box.min.x).toBeCloseTo(ROOF.length, 5);
    expect(box.max.z - box.min.z).toBeCloseTo(ROOF.span, 5);
    expect(kit.anchors.ridge).toBeDefined();
    const entryBay = kit.bays![Math.floor(kit.bays!.length / 2)];
    expect(kit.anchors.door).toEqual([(entryBay.from + entryBay.to) / 2, 0.4, -ROOF.span / 2]);
    const deck = kit.parts.find((part) => part.name === "veranda-deck-frame")!.geometry;
    const anchor = kit.anchors.deck!;
    expect(rayHits(deck, new Vector3(anchor[0], 1, anchor[2]), new Vector3(0, -1, 0))[0].y).toBeCloseTo(anchor[1], 6);
    expect(rayHits(deck, new Vector3(0, 1, ROOF.span / 2 - 0.2), new Vector3(0, -1, 0))[0].y).toBeCloseTo(0.26, 6);
    expect(rayHits(deck, new Vector3(0.5, 1.5, ROOF.span / 2 + 1), new Vector3(0, 0, -1))).toEqual([]);
  });

  it("leaves the stone lantern chamber open in both axes without lights or an emitter", () => {
    const kit = own(buildGardenOkiDoro({ width: 0.8, height: 1.15, baseY: 0.3 })), box = bounds(kit);
    expect(kit.parts.every((part) => part.role === "stone" && part.bucket === "stone")).toBe(true);
    expect(box.min.y).toBeCloseTo(0.3, 6);
    expect(box.max.y).toBeCloseTo(1.45, 6);
    expect(box.max.x - box.min.x).toBeCloseTo(0.8, 6);
    expect(box.max.z - box.min.z).toBeCloseTo(0.8, 6);
    const chamber = kit.anchors.chamber!;
    expect(kit.apertures[0].kind).toBe("chamber");
    for (const part of kit.parts) {
      expect(rayHits(part.geometry, new Vector3(0, chamber[1], 1), new Vector3(0, 0, -1))).toEqual([]);
      expect(rayHits(part.geometry, new Vector3(1, chamber[1], 0), new Vector3(-1, 0, 0))).toEqual([]);
    }
    expect(kit.anchors.eaves).toHaveLength(4);
    expect(kit.anchors.ridge).toBeDefined();
  });

  it("bounds each part's triangles and reserves at most 16k for a complete nine-station kit", () => {
    const ceilings: Record<string, number> = {
      "roof-field": 96, "ridge-end-courses": 144, "underside-rafters": 576,
      "structural-bays": 600, "recessed-plaster": 300, "veranda-deck-frame": 900,
      "oki-doro-base-chamber": 96, "oki-doro-roof-field": 96, "oki-doro-ridge-end-courses": 144,
    };
    let maxLength = 0, maxSpan = 0;
    for (const profile of PROFILES) {
      let total = 0;
      for (const type of Object.keys(STATION_SCALE_LADDER) as StationType[]) {
        const scale = stationScaleFor(type, 100, 1);
        maxLength = Math.max(maxLength, scale.length);
        maxSpan = Math.max(maxSpan, scale.span);
        const roof = { ...ROOF, length: scale.length, span: scale.span, profile };
        // The default 3m bay module reserves the gross kit cost at the actual
        // supply-frontage maxima, even before existing shell geometry is displaced.
        const kits = [own(buildGardenRoof(roof)), own(buildGardenTimberBay({ ...FRAME, length: scale.length, span: scale.span, bayLength: 3 })), own(buildGardenOkiDoro())];
        for (const kit of kits) for (const part of kit.parts) {
          const triangles = part.geometry.getAttribute("position").count / 3;
          expect(triangles, `${type} ${part.name}`).toBeLessThanOrEqual(ceilings[part.name]);
          total += triangles;
        }
      }
      expect(total, profile).toBeLessThanOrEqual(16_000);
    }
    const veranda = own(buildGardenVeranda({ ...ROOF, length: maxLength, span: maxSpan, deckY: 0.4 }));
    for (const part of veranda.parts) expect(part.geometry.getAttribute("position").count / 3, part.name).toBeLessThanOrEqual(ceilings[part.name]);
  });

  it("gives ownership to callers and rejects nonfinite dimensions before geometry authoring", () => {
    const a = own(buildGardenOkiDoro()), b = own(buildGardenOkiDoro());
    const disposed = vi.fn();
    const disposedGeometry = a.parts.shift()!.geometry;
    disposedGeometry.addEventListener("dispose", disposed);
    disposedGeometry.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(b.parts[0].geometry.getAttribute("position").count).toBeGreaterThan(0);
    disposedGeometry.removeEventListener("dispose", disposed);
    expect(() => buildGardenRoof({ ...ROOF, span: NaN })).toThrow(RangeError);
    expect(() => buildGardenTimberBay({ ...FRAME, floorY: Infinity })).toThrow(RangeError);
    expect(() => buildGardenVeranda({ ...ROOF, deckY: NaN })).toThrow(RangeError);
    expect(() => buildGardenOkiDoro({ width: -1 })).toThrow(RangeError);
  });
});
