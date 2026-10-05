import { Color, MeshStandardMaterial, Vector3, type AmbientLight, type HemisphereLight, type Material, type WebGLProgramParametersWithUniforms } from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import { GARDEN_ISLAND_TILE_OFFSET, GARDEN_LIGHTHOUSE_ROOT_OFFSET, GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { TILE_SCALE, type ScreenPoint } from "../systems/projection";
import { REST_SEAT_EYE_LANDSCAPE, REST_SEAT_YAW_RAD } from "../systems/rest-seat";
import { chainGardenMaterialPatch } from "./garden-aerial";
import { getGardenSurfaceExemption } from "./garden-surfaces";

/** Redistribute this measured share of analytic diffuse, never add another fill. */
export const GARDEN_IRRADIANCE_SHARE = 0.25;
export interface GardenL1Irradiance {
  c0: Vector3;
  cx: Vector3;
  cy: Vector3;
  cz: Vector3;
}
export interface GardenIrradianceZone extends GardenL1Irradiance {
  center: Vector3;
  extent: Vector3;
  axis: Vector3;
  visibility: number;
  reflectance: Vector3;
}

function coefficients(): GardenL1Irradiance {
  return { c0: new Vector3(), cx: new Vector3(), cy: new Vector3(), cz: new Vector3() };
}
function zone(center: Vector3, extent: Vector3, axis: Vector3, visibility: number, pigment: string): GardenIrradianceZone {
  const color = new Color(pigment);
  return { ...coefficients(), center, extent, axis, visibility, reflectance: new Vector3(color.r, color.g, color.b) };
}
const seat = REST_SEAT_EYE_LANDSCAPE.world;
const sinYaw = Math.sin(REST_SEAT_YAW_RAD);
const cosYaw = Math.cos(REST_SEAT_YAW_RAD);
export const GARDEN_IRRADIANCE_ZONES: readonly [GardenIrradianceZone, GardenIrradianceZone, GardenIrradianceZone] = [
  // Shade stays at the near engawa, not across the newly sunlit triad/steps.
  zone(new Vector3(seat.x - 7 * sinYaw, 12, seat.z - 7 * cosYaw), new Vector3(23, 14, 20), new Vector3(0.15, 1, -0.1), 0.82, HARBOR_PALETTE.timber_mid),
  zone(new Vector3(0, GARDEN_LIGHTHOUSE_ROOT_OFFSET.y, 0), new Vector3(23, 18, 23), new Vector3(-0.1, 1, 0.12), 0.96, HARBOR_PALETTE.stone_mid),
  zone(new Vector3(seat.x - 52 * sinYaw, GARDEN_WATER_Y + 2, seat.z - 52 * cosYaw), new Vector3(46, 16, 43), new Vector3(0, 1, 0), 1, HARBOR_PALETTE.aurora_green),
];
export const GARDEN_IRRADIANCE_BASE = coefficients();
export const gardenIrradianceUniforms = {
  uGardenIrradianceBase: { value: GARDEN_IRRADIANCE_BASE },
  uGardenIrradianceZones: { value: GARDEN_IRRADIANCE_ZONES },
};
const ambient = new Vector3();
const sky = new Vector3();
const ground = new Vector3();
const localSky = new Vector3();
const localGround = new Vector3();

/** Normalized hemisphere L1: c0 >= length([cx,cy,cz]) per channel. */
export function writeGardenIrradianceCoefficients(out: GardenL1Irradiance, a: Vector3, s: Vector3, g: Vector3, axis: Vector3): void {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  const x = length > 1e-6 ? axis.x / length : 0;
  const y = length > 1e-6 ? axis.y / length : 1;
  const z = length > 1e-6 ? axis.z / length : 0;
  out.c0.set(a.x + (s.x + g.x) * 0.5, a.y + (s.y + g.y) * 0.5, a.z + (s.z + g.z) * 0.5);
  out.cx.set((s.x - g.x) * 0.5 * x, (s.y - g.y) * 0.5 * x, (s.z - g.z) * 0.5 * x);
  out.cy.set((s.x - g.x) * 0.5 * y, (s.y - g.y) * 0.5 * y, (s.z - g.z) * 0.5 * y);
  out.cz.set((s.x - g.x) * 0.5 * z, (s.y - g.y) * 0.5 * z, (s.z - g.z) * 0.5 * z);
}

/** Meter actual drifted lights after DEV overrides. No allocation/readback. */
export function updateGardenIrradiance(ambientLight: AmbientLight, hemisphereLight: HemisphereLight, lighthouseTile: ScreenPoint): void {
  GARDEN_IRRADIANCE_ZONES[1].center.set(
    (lighthouseTile.x + GARDEN_ISLAND_TILE_OFFSET.x) * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
    (lighthouseTile.y + GARDEN_ISLAND_TILE_OFFSET.y) * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
  );
  const ai = Math.max(0, ambientLight.intensity) * GARDEN_IRRADIANCE_SHARE;
  const hi = Math.max(0, hemisphereLight.intensity) * GARDEN_IRRADIANCE_SHARE;
  ambient.set(ambientLight.color.r * ai, ambientLight.color.g * ai, ambientLight.color.b * ai);
  sky.set(hemisphereLight.color.r * hi, hemisphereLight.color.g * hi, hemisphereLight.color.b * hi);
  ground.set(hemisphereLight.groundColor.r * hi, hemisphereLight.groundColor.g * hi, hemisphereLight.groundColor.b * hi);
  writeGardenIrradianceCoefficients(GARDEN_IRRADIANCE_BASE, ambient, sky, ground, hemisphereLight.position);
  for (let i = 0; i < 3; i++) {
    const field = GARDEN_IRRADIANCE_ZONES[i]!;
    localSky.copy(sky).multiplyScalar(field.visibility);
    localGround.set(
      ground.x * 0.85 + sky.x * field.reflectance.x * 0.15,
      ground.y * 0.85 + sky.y * field.reflectance.y * 0.15,
      ground.z * 0.85 + sky.z * field.reflectance.z * 0.15,
    );
    writeGardenIrradianceCoefficients(field, ambient, localSky, localGround, field.axis);
  }
}

function evaluateL1(out: Color, field: GardenL1Irradiance, x: number, y: number, z: number): void {
  out.setRGB(Math.max(0, field.c0.x + field.cx.x * x + field.cy.x * y + field.cz.x * z),
    Math.max(0, field.c0.y + field.cx.y * x + field.cy.y * y + field.cz.y * z),
    Math.max(0, field.c0.z + field.cx.z * x + field.cy.z * y + field.cz.z * z));
}
/** CPU twin of the three bounded GLSL evaluations; out is caller-owned. */
export function writeGardenIrradiance(out: Color, position: Vector3, normal: Vector3, fields: readonly GardenIrradianceZone[] = GARDEN_IRRADIANCE_ZONES, base = GARDEN_IRRADIANCE_BASE): Color {
  const length = Math.max(Math.hypot(normal.x, normal.y, normal.z), 1e-6);
  const x = normal.x / length;
  const y = normal.y / length;
  const z = normal.z / length;
  evaluateL1(out, base, x, y, z);
  let weight = 1;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    const dx = (position.x - field.center.x) / Math.max(field.extent.x, 0.001);
    const dy = (position.y - field.center.y) / Math.max(field.extent.y, 0.001);
    const dz = (position.z - field.center.z) / Math.max(field.extent.z, 0.001);
    const w = Math.exp(-(dx * dx + dy * dy + dz * dz));
    out.r += Math.max(0, field.c0.x + field.cx.x * x + field.cy.x * y + field.cz.x * z) * w;
    out.g += Math.max(0, field.c0.y + field.cx.y * x + field.cy.y * y + field.cz.y * z) * w;
    out.b += Math.max(0, field.c0.z + field.cx.z * x + field.cy.z * y + field.cz.z * z) * w;
    weight += w;
  }
  return out.multiplyScalar(1 / weight);
}

export const GARDEN_IRRADIANCE_GLSL = /* glsl */ `
struct GardenIrradianceL1 { vec3 c0; vec3 cx; vec3 cy; vec3 cz; };
struct GardenIrradianceZone { vec3 center; vec3 extent; vec3 c0; vec3 cx; vec3 cy; vec3 cz; };
uniform GardenIrradianceL1 uGardenIrradianceBase;
uniform GardenIrradianceZone uGardenIrradianceZones[3];
vec3 gardenIrradianceDelta(vec3 p, vec3 n) {
  vec3 base = max(vec3(0.0), uGardenIrradianceBase.c0 + uGardenIrradianceBase.cx * n.x + uGardenIrradianceBase.cy * n.y + uGardenIrradianceBase.cz * n.z);
  vec3 local = base;
  float weight = 1.0;
  for (int i = 0; i < 3; i++) {
    GardenIrradianceZone field = uGardenIrradianceZones[i];
    vec3 d = (p - field.center) / max(field.extent, vec3(0.001));
    float w = exp(-dot(d, d));
    local += max(vec3(0.0), field.c0 + field.cx * n.x + field.cy * n.y + field.cz * n.z) * w;
    weight += w;
  }
  return local / weight - base;
}
`;

function injectIrradiance(shader: WebGLProgramParametersWithUniforms): void {
  Object.assign(shader.uniforms, gardenIrradianceUniforms);
  const prepared = shader.vertexShader.includes("varying vec3 vGardenSurfacePosition;");
  const mask = shader.fragmentShader.includes("vHullFinish")
    ? "(1.0 - clamp(vHullFinish.y, 0.0, 1.0))" : "1.0";
  if (!prepared) {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGardenIrradiancePosition;")
      .replace("#include <project_vertex>", `#include <project_vertex>
vec4 gardenIrradiancePosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  gardenIrradiancePosition = batchingMatrix * gardenIrradiancePosition;
#endif
#ifdef USE_INSTANCING
  gardenIrradiancePosition = instanceMatrix * gardenIrradiancePosition;
#endif
vGardenIrradiancePosition = (modelMatrix * gardenIrradiancePosition).xyz;`);
  }
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${prepared ? "" : "varying vec3 vGardenIrradiancePosition;"}\n${GARDEN_IRRADIANCE_GLSL}`)
    .replace("#include <lights_fragment_end>", `
vec3 gardenIrradianceNormal = transpose(mat3(viewMatrix)) * normal;
gardenIrradianceNormal /= max(length(gardenIrradianceNormal), 1e-6);
irradiance = max(vec3(0.0), irradiance + gardenIrradianceDelta(${prepared ? "vGardenSurfacePosition" : "vGardenIrradiancePosition"}, gardenIrradianceNormal) * ${mask});
#include <lights_fragment_end>`);
}

/** One indirect slot, including timber without an atlas; identity stays exempt. */
export function applyGardenIrradiance(material: Material): void {
  if (!(material instanceof MeshStandardMaterial) || getGardenSurfaceExemption(material)
    || material.userData.gardenPrintInkExempt === true) return;
  chainGardenMaterialPatch(material, { key: "garden-irradiance-v1", slot: "garden-irradiance", stage: "indirect", compile: injectIrradiance });
}
