import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_WATER_Y,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  blendDayCycleColor,
  DAY_CYCLE_SKY_PRESETS,
  type DayCyclePhase,
} from "./garden-day-cycle";
import { gardenModelAnchor } from "./garden-models";
import { stableUnit } from "./garden-util";

// L1 silhouette contract (Pharos Wonder 2026-07-24, decision D1 — supersedes
// D-L1's 30-unit call): the fallback shell mirrors the GLB v4 three-tier
// Pharos — battered square tier (2.5→17.5, half-width 3.4→2.9) → octagonal
// drum (→26) → cylindrical drum (→29.5) → open brazier (beacon at
// GARDEN_LIGHTHOUSE_BEACON_Y) → Zeus Soter statue (sceptre tip at
// GARDEN_LIGHTHOUSE_HEIGHT) — so the pre-load/failure frame and the loaded
// model never disagree on anchors.
const TERRACE_TOP_Y = 2.5;
const SQUARE_TOP_Y = 17.5;
const SQUARE_BASE_HALF = 3.4;
const SQUARE_TOP_HALF = 2.9;
const OCT_TOP_Y = 26;
const OCT_BASE_RADIUS = 2.15;
const OCT_TOP_RADIUS = 2.0;
const CYL_TOP_Y = 29.5;
const CYL_RADIUS = 1.35;
const OCT_FACE = Math.cos(Math.PI / 8);
const SQRT2 = Math.SQRT2;

const squareHalf = (y: number): number => SQUARE_BASE_HALF
  + (SQUARE_TOP_HALF - SQUARE_BASE_HALF)
    * (y - TERRACE_TOP_Y) / (SQUARE_TOP_Y - TERRACE_TOP_Y);

const octRadius = (y: number): number => OCT_BASE_RADIUS
  + (OCT_TOP_RADIUS - OCT_BASE_RADIUS)
    * (y - SQUARE_TOP_Y) / (OCT_TOP_Y - SQUARE_TOP_Y);

// C1: every colour derives from HARBOR_PALETTE — no local hex literals.
const P = HARBOR_PALETTE;
const palette = (hex: string): Color => new Color(hex);
const STONE_PALE_WARM = palette(P.foam_white).lerp(palette(P.lantern_glow), 0.22);
const STONE_MID = STONE_PALE_WARM.clone().lerp(palette(P.stone_pale), 0.45);
const STONE_SHADOW = palette(P.stone_pale).lerp(palette(P.fog_blue), 0.25);
const BRONZE = palette(P.timber_mid).lerp(palette(P.iron_dark), 0.4);
// Bronze-gilt statue: the highest metalness in the shell, warm emissive
// whisper so the god catches the dusk bloom (D2, statue gleam).
const GILT = palette(P.lantern_warm).lerp(palette(P.lantern_glow), 0.35);
const STAIR_STONE = palette(P.foam_white).lerp(palette(P.lantern_glow), 0.3);
const SHORE_STONE = palette(P.stone_mid).lerp(palette(P.fog_pale), 0.25);

interface LighthouseModelTarget {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconFireRoot?: Object3D | null;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  rayFan?: Mesh<BufferGeometry, ShaderMaterial> | null;
  statueGleamMaterials?: MeshStandardMaterial[];
  summitBirdsRoot?: Object3D | null;
}

export function attachGardenLighthouseModel(
  model: Group | null,
  content: LighthouseModelTarget | null,
): void {
  if (!content || !model) return;

  model.removeFromParent();
  model.traverse((object) => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  content.lighthouseRoot.add(model);
  content.lighthouseShell.visible = false;

  const beaconPosition = gardenModelAnchor(
    model,
    "garden-lighthouse-shell",
    "beacon",
  ).position;
  const beamPosition = gardenModelAnchor(
    model,
    "garden-lighthouse-shell",
    "beam",
  ).position;
  content.beacon.position.copy(beaconPosition);
  content.beaconHalo.position.copy(beaconPosition);
  content.lighthouseLight.position.copy(beaconPosition);
  content.beam.position.copy(beamPosition);
  content.beaconFireRoot?.position.copy(beaconPosition);
  content.summitBirdsRoot?.position.copy(beaconPosition);
  if (content.rayFan) content.rayFan.position.copy(beamPosition);
  prepareLighthouseModelMaterials(model, content.statueGleamMaterials);
}

/**
 * W7 presence for the loaded GLB: the shared-cache bronze-gilt is cloned once
 * per attached instance so the day-cycle can animate the Zeus Soter statue
 * gleam without mutating the model library's materials, then the rim light is
 * chained onto every lit material (the cloud-shadow hook composes the same
 * way — see applyLighthouseRimLight).
 */
function prepareLighthouseModelMaterials(
  model: Group,
  statueGleamMaterials: MeshStandardMaterial[] | undefined,
): void {
  if (!model.userData.lighthouseGleamCloned) {
    model.userData.lighthouseGleamCloned = true;
    const clones = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const next = materials.map((material) => {
        if (!(material instanceof MeshStandardMaterial) || material.name !== "bronze-gilt") {
          return material;
        }
        let clone = clones.get(material);
        if (!clone) {
          clone = material.clone();
          clone.name = material.name;
          clones.set(material, clone);
        }
        return clone;
      });
      object.material = Array.isArray(object.material) ? next : next[0]!;
    });
  }
  applyLighthouseRimLight(model);
  if (statueGleamMaterials) {
    statueGleamMaterials.length = 0;
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial && material.name === "bronze-gilt") {
          statueGleamMaterials.push(material);
        }
      }
    });
  }
}

/**
 * W7 rim light: a fresnel rim in a sky-palette colour, masked to sky-facing
 * normals, injected into the tower's lit materials via onBeforeCompile so the
 * Pharos separates from the sky like an engraving. Composes with the I3
 * cloud-shadow hook (garden-island.ts): whichever patch ran first is chained,
 * never clobbered, and the program cache key is extended so rim-only and
 * cloud+rim variants never collide. Uniforms are module-level and shared, so
 * updateLighthouseRimLight retunes every patched material in one write.
 */
const RIM_UNIFORMS = {
  uLighthouseRimColor: { value: new Color(HARBOR_PALETTE.moonlight) },
  uLighthouseRimStrength: { value: 0.1 },
  // Matches the world-renderer key sun at (-35, 48, -30) aimed at y≈3.
  uLighthouseRimSunDir: { value: new Vector3(-35, 45, -30).normalize() },
};
const RIM_NIGHT_COLOR = palette(P.moonlight).lerp(palette(P.fog_blue), 0.4);
const RIM_DUSK_COLOR = DAY_CYCLE_SKY_PRESETS.dusk.horizon.clone();
const RIM_DAY_COLOR = DAY_CYCLE_SKY_PRESETS.day.horizon.clone();

const RIM_FRAGMENT_PARS = /* glsl */ `
  uniform vec3 uLighthouseRimColor;
  uniform float uLighthouseRimStrength;
  uniform vec3 uLighthouseRimSunDir;
`;
const RIM_FRAGMENT_CHUNK = /* glsl */ `
  {
    vec3 rimViewDir = normalize( vViewPosition );
    float rimFresnel = pow(
      1.0 - clamp( dot( normalize( normal ), rimViewDir ), 0.0, 1.0 ),
      2.6
    );
    vec3 rimSunView = normalize(
      ( viewMatrix * vec4( uLighthouseRimSunDir, 0.0 ) ).xyz
    );
    float rimSkyMask = smoothstep( 0.0, 0.6, dot( normal, rimSunView ) );
    totalEmissiveRadiance += uLighthouseRimColor
      * ( uLighthouseRimStrength * rimFresnel * rimSkyMask );
  }
`;

export function applyLighthouseRimLight(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      if (material.userData.lighthouseRim) continue;
      material.userData.lighthouseRim = true;
      const previous = material.onBeforeCompile;
      // Captured now (not at key time): the previous hook's source
      // discriminates cloud+rim materials from rim-only ones below.
      const previousHookSource = previous.toString();
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        // Share the module-level uniform objects — never copy — so one
        // day-cycle write reaches every tower material.
        shader.uniforms.uLighthouseRimColor = RIM_UNIFORMS.uLighthouseRimColor;
        shader.uniforms.uLighthouseRimStrength = RIM_UNIFORMS.uLighthouseRimStrength;
        shader.uniforms.uLighthouseRimSunDir = RIM_UNIFORMS.uLighthouseRimSunDir;
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>\n${RIM_FRAGMENT_PARS}`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>\n${RIM_FRAGMENT_CHUNK}`,
          );
      };
      // Distinguish rim-only from cloud+rim programs: the default cache key
      // is onBeforeCompile's source, identical for every chained closure, so
      // fold in the chained-from hook's source length (the cloud hook's
      // closure differs from the default empty method).
      material.customProgramCacheKey = () => (
        `${previousHookSource.length}|lighthouse-rim`
      );
    }
  });
}

/** Day-cycle driver for the shared rim uniforms (called once per frame). */
export function updateLighthouseRimLight(phase: DayCyclePhase): void {
  blendDayCycleColor(
    RIM_UNIFORMS.uLighthouseRimColor.value,
    RIM_NIGHT_COLOR,
    RIM_DUSK_COLOR,
    RIM_DAY_COLOR,
    phase.dusk,
    phase.daylight,
  );
  // Subtle by day; strongest at night where the tower meets the indigo sky.
  RIM_UNIFORMS.uLighthouseRimStrength.value = 0.1 + phase.dusk * 0.04 + phase.night * 0.08;
}

export function createLighthouse(): {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  light: PointLight;
  rayFan: Mesh<BufferGeometry, ShaderMaterial>;
  root: Group;
  shell: Group;
} {
  const root = new Group();
  const paleStone = new MeshStandardMaterial({
    color: STONE_PALE_WARM,
    // Matches the GLB's warm-bounce lift (L4): the camera sees the tower's
    // shade side, so albedo + this whisper of warmth carry the day read.
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.05,
    flatShading: true,
    roughness: 0.88,
  });
  const midStone = new MeshStandardMaterial({
    color: STONE_MID,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.05,
    flatShading: true,
    roughness: 0.94,
  });
  const shadowStone = new MeshStandardMaterial({
    color: STONE_SHADOW,
    flatShading: true,
    roughness: 0.96,
  });
  const bronze = new MeshStandardMaterial({
    color: BRONZE,
    metalness: 0.5,
    roughness: 0.5,
  });
  const gilt = new MeshStandardMaterial({
    color: GILT,
    emissive: HARBOR_PALETTE.lantern_glow,
    emissiveIntensity: 0.08,
    metalness: 0.85,
    // Matches the GLB's material name so the W7 statue gleam finds the god in
    // both the procedural shell and the loaded model.
    name: "bronze-gilt",
    roughness: 0.3,
  });
  // Double-sided so the open brazier bowl reads solid from above.
  const brazierBronze = new MeshStandardMaterial({
    color: BRONZE,
    metalness: 0.5,
    roughness: 0.5,
    side: DoubleSide,
  });

  const stairMaterial = new MeshStandardMaterial({
    color: STAIR_STONE,
    flatShading: true,
    roughness: 1,
  });
  // Grand square terrace: three box steps up to the tower plinth.
  for (const [width, height, y] of [
    [9.2, 0.85, 0.425],
    [8.4, 0.85, 1.275],
    [7.7, 0.8, 2.1],
  ] as const) {
    const step = new Mesh(new BoxGeometry(width, height, width), stairMaterial);
    step.position.set(0, y, 0);
    root.add(step);
  }

  // Battered square tier (half-width 3.4 → 2.9): a square cylinder with
  // different top/bottom half-widths, rotated π/4 so a flat face fronts +Z
  // (same facing convention as the GLB).
  const lowerTier = new Mesh(
    new CylinderGeometry(
      squareHalf(10) * SQRT2,
      squareHalf(TERRACE_TOP_Y) * SQRT2,
      10 - TERRACE_TOP_Y,
      4,
    ),
    paleStone,
  );
  lowerTier.position.y = (10 + TERRACE_TOP_Y) / 2;
  lowerTier.rotation.y = Math.PI / 4;
  root.add(lowerTier);

  const upperTier = new Mesh(
    new CylinderGeometry(
      squareHalf(SQUARE_TOP_Y) * SQRT2,
      squareHalf(10) * SQRT2,
      SQUARE_TOP_Y - 10,
      4,
    ),
    midStone,
  );
  upperTier.position.y = (10 + SQUARE_TOP_Y) / 2;
  upperTier.rotation.y = Math.PI / 4;
  root.add(upperTier);

  const doorMaterial = new MeshStandardMaterial({
    color: palette(P.timber_dark),
    roughness: 0.82,
  });
  // Elevated pylon doorway (~y 8, storm-raised) with a dark-bronze lintel and
  // a simple approach ramp climbing the seaward face.
  const landing = new Mesh(new BoxGeometry(1.5, 0.22, 0.95), stairMaterial);
  landing.position.set(0.55, 7.82, squareHalf(7.82) + 0.32);
  root.add(landing);
  const door = new Mesh(new BoxGeometry(0.95, 1.55, 0.14), doorMaterial);
  door.position.set(0.55, 8.6, squareHalf(8.6) + 0.02);
  root.add(door);
  const lintel = new Mesh(new BoxGeometry(1.62, 0.34, 0.26), bronze);
  lintel.position.set(0.55, 9.6, squareHalf(9.6) + 0.04);
  root.add(lintel);
  const ramp = new Mesh(new BoxGeometry(6.0, 0.18, 0.95), stairMaterial);
  ramp.position.set(-1.7, 5.14, 3.6);
  ramp.rotation.z = Math.atan2(5.04, 3.2);
  root.add(ramp);

  const windowMaterial = new MeshStandardMaterial({
    color: palette(P.iron_dark).lerp(palette(P.lantern_cold), 0.35),
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.24,
    roughness: 0.38,
    toneMapped: false,
  });
  // Slit windows up the tiers — a vertical rhythm of scale cues (L3).
  for (const [x, y] of [
    [-1.4, 11.2],
    [1.5, 5.4],
  ] as const) {
    const window = new Mesh(new BoxGeometry(0.26, 0.52, 0.1), windowMaterial);
    window.position.set(x, y, squareHalf(y) + 0.03);
    root.add(window);
  }
  for (const side of [-1, 1]) {
    const window = new Mesh(new BoxGeometry(0.26, 0.52, 0.1), windowMaterial);
    window.position.set(side * (squareHalf(9.6) + 0.03), 9.6, 0);
    window.rotation.y = side * Math.PI / 2;
    root.add(window);
  }
  const drumWindow = new Mesh(new BoxGeometry(0.26, 0.52, 0.1), windowMaterial);
  drumWindow.position.set(0, 21, octRadius(21) * OCT_FACE + 0.03);
  root.add(drumWindow);

  // Corbel table at the octagon's base: flared ring plus a slab cornice.
  const corbelFlare = new Mesh(
    new CylinderGeometry(2.4, 3.0, 0.65, 8),
    midStone,
  );
  corbelFlare.position.y = 17.825;
  corbelFlare.rotation.y = Math.PI / 8;
  root.add(corbelFlare);
  const corbelSlab = new Mesh(
    new CylinderGeometry(2.55, 2.55, 0.24, 8),
    shadowStone,
  );
  corbelSlab.position.y = 18.27;
  corbelSlab.rotation.y = Math.PI / 8;
  root.add(corbelSlab);

  // Octagonal drum (17.5 → 26), then the short cylindrical drum (→ 29.5).
  const octDrum = new Mesh(
    new CylinderGeometry(OCT_TOP_RADIUS, OCT_BASE_RADIUS, OCT_TOP_Y - SQUARE_TOP_Y, 8),
    paleStone,
  );
  octDrum.position.y = (SQUARE_TOP_Y + OCT_TOP_Y) / 2;
  octDrum.rotation.y = Math.PI / 8;
  root.add(octDrum);

  // Four Triton corner finials: simplified cone+sphere conch-blowers standing
  // on the square tier's top corners, facing outward along the diagonals.
  for (const [x, z] of [
    [2.55, 2.55],
    [-2.55, 2.55],
    [2.55, -2.55],
    [-2.55, -2.55],
  ] as const) {
    const triton = new Group();
    const body = new Mesh(new ConeGeometry(0.2, 0.8, 5), shadowStone);
    body.position.y = 0.4;
    triton.add(body);
    const head = new Mesh(new SphereGeometry(0.13, 6, 4), shadowStone);
    head.position.y = 0.95;
    triton.add(head);
    const conch = new Mesh(new ConeGeometry(0.08, 0.3, 5), bronze);
    conch.position.set(0, 0.92, 0.2);
    conch.rotation.x = -0.9;
    triton.add(conch);
    triton.position.set(x, SQUARE_TOP_Y, z);
    triton.rotation.y = Math.atan2(x, z);
    root.add(triton);
  }

  const drumBaseRing = new Mesh(
    new CylinderGeometry(1.5, 1.5, 0.28, 16),
    shadowStone,
  );
  drumBaseRing.position.y = 26.14;
  root.add(drumBaseRing);
  const cylDrum = new Mesh(
    new CylinderGeometry(CYL_RADIUS, CYL_RADIUS, CYL_TOP_Y - OCT_TOP_Y, 16),
    midStone,
  );
  cylDrum.position.y = (OCT_TOP_Y + CYL_TOP_Y) / 2;
  root.add(cylDrum);

  // Open bronze brazier (D2 — no glazed lantern): foot, flared bowl, and a
  // dark ember bed centred exactly at GARDEN_LIGHTHOUSE_BEACON_Y.
  const brazierFoot = new Mesh(
    new CylinderGeometry(0.55, 0.82, 0.3, 12),
    brazierBronze,
  );
  brazierFoot.position.y = 29.65;
  root.add(brazierFoot);
  const brazierBowl = new Mesh(
    new CylinderGeometry(1.25, 0.55, 0.95, 12, 1, true),
    brazierBronze,
  );
  brazierBowl.position.y = 30.275;
  root.add(brazierBowl);
  const emberBed = new Mesh(
    new CylinderGeometry(1.02, 1.02, 0.16, 12),
    new MeshStandardMaterial({
      color: palette(P.ember),
      emissive: HARBOR_PALETTE.lantern_glow,
      emissiveIntensity: 1.45,
      flatShading: true,
      roughness: 0.5,
      toneMapped: false,
    }),
  );
  emberBed.position.y = GARDEN_LIGHTHOUSE_BEACON_Y;
  root.add(emberBed);

  // Crowning Zeus Soter: tapered robe, head, long vertical sceptre in one
  // hand, the other arm outstretched toward the sea (+Z front). Bronze-gilt,
  // oversized per the Roman-coin convention; sceptre tip = HEIGHT.
  const robe = new Mesh(new CylinderGeometry(0.3, 0.52, 2.0, 8), gilt);
  robe.position.y = 31.4;
  root.add(robe);
  const chest = new Mesh(new CylinderGeometry(0.34, 0.3, 0.55, 8), gilt);
  chest.position.y = 32.675;
  root.add(chest);
  const head = new Mesh(new SphereGeometry(0.23, 8, 6), gilt);
  head.position.y = 33.22;
  root.add(head);
  const sceptre = new Mesh(new CylinderGeometry(0.05, 0.05, 2.3, 6), gilt);
  sceptre.position.set(-0.5, GARDEN_LIGHTHOUSE_HEIGHT - 1.15, 0.1);
  root.add(sceptre);
  const sceptreTip = new Mesh(new SphereGeometry(0.1, 6, 4), gilt);
  sceptreTip.position.set(-0.5, 33.87, 0.1);
  root.add(sceptreTip);
  const seaArm = new Mesh(new BoxGeometry(0.16, 0.16, 1.05), gilt);
  seaArm.position.set(0.18, 32.78, 0.6);
  root.add(seaArm);
  const sceptreArm = new Mesh(new BoxGeometry(0.52, 0.14, 0.14), gilt);
  sceptreArm.position.set(-0.32, 32.72, 0.08);
  root.add(sceptreArm);

  const shell = new Group();
  shell.name = "lighthouse-procedural-shell";
  shell.add(...root.children);
  // Geometry budget (perf lane: geometries ≤ 275): the fallback shell is
  // visible until the GLB attaches, so every primitive would be GPU-uploaded
  // and counted. Nothing inside the shell moves at runtime (the frame path
  // only toggles shell.visible), so the 40+ static primitives merge into one
  // mesh per material group — visuals, materials (incl. the "bronze-gilt"
  // statue-gleam name), and shadows are identical, ~10 geometries instead.
  mergeStaticShellMeshes(shell);
  root.add(shell);

  // L3 shore props (keeper's rowboat + waterline stones) stay OUTSIDE the
  // shell: they ground the tower at the lee shore in both fallback and GLB
  // modes, so they must survive `lighthouseShell.visible = false`.
  root.add(createKeeperShoreProps());

  // W4 (Pharos Wonder D2): the old glowing beacon sphere is retired as the
  // fire core — the toon flame in garden-beacon-fire.ts owns the summit now.
  // The sphere lives on shrunk to an ember-glow core sitting inside the
  // brazier bowl, under the flame; the day-cycle banks it well below the old
  // hero intensity so it reads as coals, not a floating lamp.
  const beacon = new Mesh(
    new SphereGeometry(0.34, 12, 8),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_warm,
      emissive: HARBOR_PALETTE.lantern_glow,
      emissiveIntensity: 1.1,
      roughness: 0.3,
      toneMapped: false,
    }),
  );
  beacon.position.y = GARDEN_LIGHTHOUSE_BEACON_Y;
  root.add(beacon);

  const halo = new Mesh(
    new SphereGeometry(1.7, 16, 10),
    new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: HARBOR_PALETTE.lantern_glow,
      depthWrite: false,
      opacity: 0.22,
      transparent: true,
    }),
  );
  halo.position.copy(beacon.position);
  halo.name = "lighthouse-halo";
  root.add(halo);

  const light = new PointLight(
    HARBOR_PALETTE.lantern_warm,
    0.95,
    46,
    2,
  );
  light.position.copy(beacon.position);
  root.add(light);

  const beam = new Group();
  beam.position.copy(beacon.position);
  beam.add(createBeamCone(), createBeamOuterCone(), createBeamDust(), createBeamPlane());
  root.add(beam);

  // The poster ray fan is NOT part of the beam group: it rotates at its own
  // slower rate (0.07 rad/s vs the beam's 0.2) for parallax.
  const rayFan = createBeamRayFan();
  rayFan.position.copy(beacon.position);
  root.add(rayFan);

  return { beacon, beaconHalo: halo, beam, light, rayFan, root, shell };
}

/**
 * Collapses the fallback shell's static primitives into one mesh per shared
 * material. Every part (terrace steps, tiers, doorway, ramp, windows, corbel,
 * drums, tritons, brazier, statue) is positioned once at creation and never
 * touched again, so baking each mesh's transform into its geometry is
 * visually identical; materials keep their identity (the "bronze-gilt" gleam
 * lookup and the rim/cloud onBeforeCompile hooks traverse the merged meshes
 * exactly as before). Runs before first render, so nothing merged here was
 * ever GPU-uploaded.
 */
function mergeStaticShellMeshes(shell: Group): void {
  shell.updateMatrixWorld(true);
  const buckets = new Map<MeshStandardMaterial, BufferGeometry[]>();
  shell.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const material = object.material;
    if (!(material instanceof MeshStandardMaterial)) return;
    const bucket = buckets.get(material) ?? [];
    bucket.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
    buckets.set(material, bucket);
  });
  shell.clear();
  let index = 0;
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, material);
    mesh.name = `lighthouse-shell-part-${index}`;
    index += 1;
    shell.add(mesh);
  }
}

/**
 * L3 toy-scale grounding at the lee shore: a tiny keeper's rowboat and a
 * scatter of waterline stones. Positions are lighthouse-local; the water
 * plane sits at GARDEN_WATER_Y world, i.e. WATER_LOCAL_Y inside this root.
 */
const WATER_LOCAL_Y = GARDEN_WATER_Y - GARDEN_LIGHTHOUSE_ROOT_OFFSET.y;

function createKeeperShoreProps(): Group {
  const group = new Group();
  group.name = "lighthouse-shore-props";

  const hullMaterial = new MeshStandardMaterial({
    color: palette(P.timber_mid),
    flatShading: true,
    roughness: 0.9,
  });
  const trimMaterial = new MeshStandardMaterial({
    color: palette(P.timber_dark),
    flatShading: true,
    roughness: 0.92,
  });
  const benchMaterial = new MeshStandardMaterial({
    color: palette(P.timber_warm),
    flatShading: true,
    roughness: 0.95,
  });

  const rowboat = new Group();
  rowboat.name = "keeper-rowboat";
  // Simple clinker read: a tapered six-sided hull lying on its side, a bench,
  // and two shipped oars. ~1.7 units long against the 34-unit Pharos (L3).
  const hull = new Mesh(new CylinderGeometry(0.26, 0.15, 1.7, 6), hullMaterial);
  hull.rotation.z = Math.PI / 2;
  hull.scale.y = 0.72;
  rowboat.add(hull);
  const bench = new Mesh(new BoxGeometry(0.34, 0.05, 0.4), benchMaterial);
  bench.position.set(0.1, 0.12, 0);
  rowboat.add(bench);
  for (const side of [-1, 1]) {
    const oar = new Mesh(new BoxGeometry(1.1, 0.035, 0.06), trimMaterial);
    oar.position.set(-0.1, 0.16, side * 0.14);
    oar.rotation.y = side * 0.5;
    rowboat.add(oar);
  }
  rowboat.position.set(-11.0, WATER_LOCAL_Y + 0.14, 6.3);
  // Long axis along the shoreline tangent at the lee-side waterline.
  rowboat.rotation.y = -1.37;
  group.add(rowboat);

  // Waterline stones between the base rocks and the shore — half-sunk, wet.
  // Clustered on the island's front-lee waterline (lighthouse-local ≈
  // (-10, 6)): the west/back shore is occluded by the shoreline boulders
  // from the fixed camera, anything further in buries in the terrace slope,
  // anything further out floats off the shoal.
  const stoneMaterial = new MeshStandardMaterial({
    color: SHORE_STONE,
    flatShading: true,
    roughness: 0.96,
  });
  const stoneGeometry = new IcosahedronGeometry(1, 0);
  for (const [x, z, size, squash, turn] of [
    [-9.0, 5.6, 0.5, 0.7, 0.4],
    [-10.0, 6.6, 0.38, 0.75, 2.1],
    [-11.2, 7.4, 0.55, 0.7, 1.2],
    [-10.6, 5.2, 0.34, 0.8, 2.9],
    [-9.4, 6.8, 0.44, 0.7, 0.9],
  ] as const) {
    const stone = new Mesh(stoneGeometry, stoneMaterial);
    stone.position.set(x, WATER_LOCAL_Y + size * squash * 0.35, z);
    stone.scale.set(size, size * squash, size);
    stone.rotation.y = turn;
    group.add(stone);
  }

  return group;
}

// The beam sweeps horizontally along the group's +X (apex at the beacon), so
// the far end fades out roughly BEAM_LENGTH world units over the dark sea.
// L5: 44 → 58 alongside the tower's growth (now the 34-unit Pharos) so the
// sweep still crosses a meaningful arc of sea; the water beam-lane fade lives
// in garden-water.ts (Lane W).
const BEAM_LENGTH = 58;
const BEAM_BASE_RADIUS = 5.2;
const BEAM_DUST_COUNT = 40;
// C1 palette-derived: warm lantern gold lifted toward foam white.
const BEAM_COLOR = palette(P.lantern_glow).lerp(palette(P.foam_white), 0.22);

/**
 * The volumetric beam: an open additive cone (apex at the beacon, axis along
 * +X). Under the fixed ortho view a fresnel-ish edge term (grazing surfaces
 * glow, face-on softens) plus front+back additive overlap read as light in
 * air; a longitudinal fade darkens it toward the far end and slow banding
 * drifts through it. `uTime` is frozen under reduced motion by the caller.
 */
function createBeamCone(): Mesh<ConeGeometry, ShaderMaterial> {
  const geometry = new ConeGeometry(BEAM_BASE_RADIUS, BEAM_LENGTH, 28, 1, true);
  // Apex to the group origin, axis rotated from +Y to +X.
  geometry.translate(0, -BEAM_LENGTH / 2, 0);
  geometry.rotateZ(Math.PI / 2);
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying float vAlong;
      varying vec3 vNormalView;

      void main() {
        // Bright just past the apex, carrying out over the sea before fading
        // to nothing by the far end (~55 units of the 58-unit cone).
        float fade = smoothstep(0.015, 0.09, vAlong)
          * (1.0 - smoothstep(0.5, 0.99, vAlong));
        // Ortho fresnel: grazing (silhouette) surfaces glow, face-on softens.
        float rim = 1.0 - abs(vNormalView.z);
        float shaft = 0.3 + 0.7 * rim;
        float bands = 0.86 + 0.14 * sin(vAlong * 30.0 - uTime * 1.3);
        gl_FragColor = vec4(uColor, uOpacity * fade * shaft * bands);
      }
    `,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
      uLength: { value: BEAM_LENGTH },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uLength;
      varying float vAlong;
      varying vec3 vNormalView;

      void main() {
        vAlong = position.x / uLength;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
  const cone = new Mesh(geometry, material);
  cone.name = "lighthouse-beam-cone";
  return cone;
}

/**
 * W5 nested cone: one wider, fainter shell around the volumetric beam — a
 * soft fresnel skirt (no banding, lower alpha) that gives the shaft volume
 * against the night sea. Same length/axis as the inner cone so it inherits
 * the beam group's rotation; full tier only (world-renderer gates it).
 * BEAM_LENGTH stays 58 — the water beam-lane fade (garden-water.ts, Lane W)
 * is tuned to it and must not drift.
 */
function createBeamOuterCone(): Mesh<ConeGeometry, ShaderMaterial> {
  const geometry = new ConeGeometry(BEAM_BASE_RADIUS * 1.45, BEAM_LENGTH, 28, 1, true);
  geometry.translate(0, -BEAM_LENGTH / 2, 0);
  geometry.rotateZ(Math.PI / 2);
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlong;
      varying vec3 vNormalView;

      void main() {
        float fade = smoothstep(0.02, 0.14, vAlong)
          * (1.0 - smoothstep(0.35, 0.98, vAlong));
        // Pure fresnel skirt: only the grazing silhouette carries light.
        float rim = pow(1.0 - abs(vNormalView.z), 1.6);
        gl_FragColor = vec4(uColor, uOpacity * fade * rim);
      }
    `,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
      uLength: { value: BEAM_LENGTH },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uLength;
      varying float vAlong;
      varying vec3 vNormalView;

      void main() {
        vAlong = position.x / uLength;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
  const cone = new Mesh(geometry, material);
  cone.name = "lighthouse-beam-outer-cone";
  cone.visible = false;
  return cone;
}

const RAY_FAN_COUNT = 10;
// Shorter than the 58-unit beam on purpose: the fan is a close-in parallax
// layer, not a second sweep, so the water lane fade constants stay untouched.
const RAY_FAN_LENGTH = 26;

/**
 * W5 ray fan (D4 — the vintage travel-poster sunburst; poster-art license,
 * not a claim of ancient optics): ten thin triangles radiating flat from the
 * brazier, additive with vertex-alpha feathered tips. One merged geometry,
 * one draw call. The mesh rotates at 0.07 rad/s against the beam's 0.2 so the
 * two layers slide past each other; the day-cycle keeps it dusk/night only.
 */
function createBeamRayFan(): Mesh<BufferGeometry, ShaderMaterial> {
  const positions: number[] = [];
  const alphas: number[] = [];
  for (let index = 0; index < RAY_FAN_COUNT; index += 1) {
    const angle = (index / RAY_FAN_COUNT) * Math.PI * 2;
    const spread = 0.055;
    positions.push(
      Math.cos(angle) * 1.2, 0, Math.sin(angle) * 1.2,
      Math.cos(angle - spread) * RAY_FAN_LENGTH, 0, Math.sin(angle - spread) * RAY_FAN_LENGTH,
      Math.cos(angle + spread) * RAY_FAN_LENGTH, 0, Math.sin(angle + spread) * RAY_FAN_LENGTH,
    );
    // Bright at the brazier, feathered to nothing at the tip.
    alphas.push(0.5, 0, 0);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aAlpha", new Float32BufferAttribute(alphas, 1));
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;

      void main() {
        gl_FragColor = vec4(uColor, uOpacity * vAlpha);
      }
    `,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      varying float vAlpha;

      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
  const fan = new Mesh(geometry, material);
  fan.name = "lighthouse-ray-fan";
  return fan;
}

/** Faint motes suspended in the cone (full tier, motion only). */
function createBeamDust(): Points<BufferGeometry, ShaderMaterial> {
  const positions: number[] = [];
  const seeds: number[] = [];
  for (let index = 0; index < BEAM_DUST_COUNT; index += 1) {
    const along = (0.14 + stableUnit(`beam-dust-a.${index}`) * 0.72) * BEAM_LENGTH;
    const coneRadius = (along / BEAM_LENGTH) * BEAM_BASE_RADIUS;
    const radius = coneRadius * (0.15 + stableUnit(`beam-dust-r.${index}`) * 0.7);
    const angle = stableUnit(`beam-dust-t.${index}`) * Math.PI * 2;
    positions.push(along, Math.cos(angle) * radius, Math.sin(angle) * radius);
    seeds.push(stableUnit(`beam-dust-s.${index}`));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vTwinkle;

      void main() {
        float soft = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(uColor, uOpacity * soft * vTwinkle);
      }
    `,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      varying float vTwinkle;

      void main() {
        vec3 p = position;
        // Slow drift, small enough that motes stay inside the cone envelope.
        p.x += sin(uTime * 0.25 + aSeed * 6.28) * 0.6;
        p.y += sin(uTime * 0.31 + aSeed * 12.0) * 0.25;
        p.z += cos(uTime * 0.27 + aSeed * 9.0) * 0.25;
        vTwinkle = 0.5 + 0.5 * sin(uTime * 0.9 + aSeed * 20.0);
        gl_PointSize = 2.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
  });
  const dust = new Points(geometry, material);
  dust.name = "lighthouse-beam-dust";
  dust.visible = false;
  return dust;
}

/** Recovery/constrained fallback: the original flat additive beam plane. */
function createBeamPlane(): Mesh<PlaneGeometry, ShaderMaterial> {
  const geometry = new PlaneGeometry(60, 13);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(30, 0, 0);
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        float along = vUv.x;
        float across = abs(vUv.y - 0.5);
        float halfWidth = mix(0.02, 0.38, smoothstep(0.0, 1.0, along));
        float feather = 1.0 - smoothstep(halfWidth * 0.42, halfWidth, across);
        float startFade = smoothstep(0.0, 0.08, along);
        float endFade = 1.0 - smoothstep(0.7, 1.0, along);
        float strands = 0.82 + sin(along * 96.0) * 0.18;
        gl_FragColor = vec4(
          uColor,
          uOpacity * feather * startFade * endFade * strands
        );
      }
    `,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
      uOpacity: { value: 0.08 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
  const sweep = new Mesh(geometry, material);
  sweep.name = "lighthouse-beam";
  sweep.visible = false;
  return sweep;
}
