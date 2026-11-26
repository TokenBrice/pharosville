import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  MAX_SPRAY_BOWS,
  OAR_SPRAY_MAX_DIST,
  REEF_SPRAY_MIN_AMP,
  SPRAY_BUDGET,
  SPRAY_FRAG,
  SPRAY_VERT,
  SpraySystem,
} from "./spray-system";
import { SWELL_DIR, WAVES, swellPhase } from "./waves";

const SUN = new THREE.Color(1.0, 0.95, 0.85);
const AMB = new THREE.Color(0.35, 0.42, 0.52);

function glslCalls(source: string, name: string): { line: number; args: string[] }[] {
  const out: { line: number; args: string[] }[] = [];
  const re = new RegExp(`(?<![\\w.])${name}\\s*\\(`, "g");
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const args: string[] = [];
    let depth = 0, cur = "", i = m.index + m[0].length;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") { if (depth === 0) break; depth--; }
      if (c === "," && depth === 0) { args.push(cur.trim()); cur = ""; } else cur += c;
    }
    args.push(cur.trim());
    out.push({ line: source.slice(0, m.index).split("\n").length, args });
  }
  return out;
}

describe("SpraySystem (Phase 3 Workstream 3-B)", () => {
  it("configures 1-draw instanced mesh, alpha-preserving blending, uCapDepth soft-fade, and B07/C04 GLSL", () => {
    const spray = new SpraySystem();
    const mat = spray.mesh.material;

    expect(SPRAY_BUDGET).toEqual({ high: 1800, medium: 600, low: 0 });
    expect(spray.mesh.name).toBe("ocean-spray");
    expect(spray.mesh.renderOrder).toBe(63);
    expect(spray.mesh.frustumCulled).toBe(false);
    expect(spray.mesh.visible).toBe(false);
    expect(mat.name).toBe("hb_ocean_spray");
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.depthTest).toBe(true);
    expect(mat.side).toBe(THREE.FrontSide);
    expect(mat.blending).toBe(THREE.CustomBlending);
    expect(mat.blendSrc).toBe(THREE.SrcAlphaFactor);
    expect(mat.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(mat.blendSrcAlpha).toBe(THREE.ZeroFactor);
    expect(mat.blendDstAlpha).toBe(THREE.OneFactor);

    // M12 zero depth feedback: soft-fades only against standalone SceneCapture uCapDepth
    expect(SPRAY_FRAG).toContain("uniform highp sampler2D uCapDepth;");
    expect(SPRAY_FRAG).toContain("uCapNearFar");
    expect(SPRAY_FRAG).toContain("uCapSize");
    expect(SPRAY_FRAG).toContain("uCapReady");
    expect(SPRAY_FRAG).toContain("textureLod(uCapDepth, capUv, 0.0).r");
    expect(SPRAY_FRAG).toContain("smoothstep(0.0, 1.4, sceneLinZ - fragLinZ)");
    expect(SPRAY_FRAG).not.toContain("tDepth");
    expect(SPRAY_FRAG).not.toContain("depthBuffer");

    // B07 / C04: ascending literal smoothstep only, zero pow(..., 2.0)
    const shaderSrc = `${SPRAY_VERT}\n${SPRAY_FRAG}`;
    for (const { line, args } of glslCalls(shaderSrc, "smoothstep")) {
      const [e0, e1] = args.map(Number);
      if (Number.isFinite(e0) && Number.isFinite(e1)) {
        expect(e0 < e1, `line ${line} smoothstep(${args.join(", ")})`).toBe(true);
      }
    }
    const powSquares = glslCalls(shaderSrc, "pow").filter(({ args }) => /^2(\.0*)?$/.test(args[1] ?? ""));
    expect(powSquares).toEqual([]);

    // Preparation entry compiles hb_ocean_spray targeting null stall-free
    const entries = spray.preparationEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.root).toBe(spray.mesh);
    expect(entries[0]!.target()).toBeNull();

    spray.dispose();
  });

  it("enforces tier budgets (1800 / 600 / 0), disables cleanly via setEnabled, and shares SceneCapture uniforms", () => {
    const capDepth = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    const capture = {
      uCapDepth: { value: capDepth as THREE.Texture },
      uCapNearFar: { value: new THREE.Vector2(1, 5000) },
      uCapSize: { value: new THREE.Vector2(1600, 1000) },
      uCapReady: { value: 1 },
    };
    const spray = new SpraySystem({ capture });
    expect(spray.mesh.material.uniforms.uCapDepth).toBe(capture.uCapDepth);
    expect(spray.mesh.material.uniforms.uCapReady.value).toBe(1);

    // High tier caps at 1800
    spray.setTier("high");
    expect(spray.maxParticles).toBe(1800);
    for (let f = 0; f < 160; f++) {
      spray.beginFrame();
      for (let b = 0; b < 32; b++) {
        spray.pushBow(b * 6, 0, 0, 5.0, 14, 5.0, 1.8, 0, 0);
      }
      spray.step(0.05, f * 0.05, 0.85, 0.8, -0.5, SUN, AMB, 0, false);
    }
    expect(spray.activeCount).toBeGreaterThan(600);
    expect(spray.activeCount).toBeLessThanOrEqual(1800);
    expect(spray.mesh.geometry.instanceCount).toBe(spray.activeCount);
    expect(spray.mesh.visible).toBe(true);

    // Medium tier caps at 600
    spray.setTier("medium");
    expect(spray.maxParticles).toBe(600);
    expect(spray.activeCount).toBeLessThanOrEqual(600);
    spray.beginFrame();
    spray.pushBow(0, 0, 0, 4.0, 12, 4.0, 1.5, 0, 0);
    spray.step(0.05, 10, 0.6, 0.5, 0, SUN, AMB, 0, false);
    expect(spray.activeCount).toBeLessThanOrEqual(600);
    expect(spray.mesh.geometry.instanceCount).toBe(spray.activeCount);

    // Low tier zeroes active particles, instanceCount, and hides mesh
    spray.setTier("low");
    expect(spray.maxParticles).toBe(0);
    expect(spray.enabled).toBe(false);
    expect(spray.activeCount).toBe(0);
    expect(spray.mesh.geometry.instanceCount).toBe(0);
    expect(spray.mesh.visible).toBe(false);
    spray.beginFrame();
    spray.pushBow(0, 0, 0, 4.0, 12, 4.0, 1.5, 0, 0);
    spray.step(0.05, 11, 0.8, 0.5, 0, SUN, AMB, 0, false);
    expect(spray.activeCount).toBe(0);
    expect(spray.mesh.visible).toBe(false);

    // setEnabled(false) cleanly disables even on High (&extras=-spray)
    spray.setTier("high");
    spray.beginFrame();
    spray.pushBow(0, 0, 0, 4.0, 12, 4.0, 1.5, 0, 0);
    spray.step(0.05, 12, 0.6, 0.4, 0, SUN, AMB, 0, false);
    expect(spray.activeCount).toBeGreaterThan(0);

    spray.setEnabled(false);
    expect(spray.enabled).toBe(false);
    expect(spray.activeCount).toBe(0);
    expect(spray.mesh.geometry.instanceCount).toBe(0);
    expect(spray.mesh.visible).toBe(false);

    spray.dispose();
    capDepth.dispose();
  });

  it("selects only the top 32 nearest moving bows relative to focus and ignores stationary hulls", () => {
    const spray = new SpraySystem();
    spray.beginFrame();

    // Push 60 moving vessels at distances 1..60 m from focus (100, -50), plus stationary ships
    spray.pushBow(100, -50, 0, 0, 10, 0.0, 1.0, 100, -50); // stationary: ignored
    for (let i = 60; i >= 1; i--) {
      spray.pushBow(100 + i, -50, 0, 3.0, 10, 3.0, 1.0, 100, -50);
    }

    expect(spray.queuedBowCount).toBe(MAX_SPRAY_BOWS);
    const dists: number[] = [];
    for (let i = 0; i < spray.queuedBowCount; i++) {
      dists.push(spray.getQueuedBowDistSq(i));
    }
    dists.sort((a, b) => a - b);
    expect(dists[0]).toBeCloseTo(1, 5);
    expect(dists[MAX_SPRAY_BOWS - 1]).toBeCloseTo(MAX_SPRAY_BOWS * MAX_SPRAY_BOWS, 5);

    spray.dispose();
  });

  it("pulses windward reef plumes by swellPhase only when seaAmp > 0.14", () => {
    const spray = new SpraySystem();
    const ax = 120, az = -80;
    const anchors: ReadonlyArray<readonly [number, number, number, number]> = [
      [ax, az, -SWELL_DIR[0], -SWELL_DIR[1]],
      [ax + 6, az + 4, -SWELL_DIR[0], -SWELL_DIR[1]],
      [ax + 12, az + 8, -SWELL_DIR[0], -SWELL_DIR[1]],
    ];
    spray.setReefAnchors(anchors);
    expect(spray.reefAnchorCount).toBe(3);

    // Solve time where swellPhase(ax, az, t) === pi/2 (crest) and -pi/2 (trough)
    const w0 = WAVES[0]!;
    const spatial = w0.k * (w0.dirX * ax + w0.dirZ * az);
    const tCrest = (spatial - Math.PI / 2) / w0.w;
    const tTrough = (spatial + Math.PI / 2) / w0.w;
    expect(Math.sin(swellPhase(ax, az, tCrest))).toBeCloseTo(1, 5);
    expect(Math.sin(swellPhase(ax, az, tTrough))).toBeCloseTo(-1, 5);

    // Calm sea (seaAmp <= 0.14): zero reef emissions even on crest
    for (let i = 0; i < 8; i++) {
      spray.step(0.05, tCrest, REEF_SPRAY_MIN_AMP, 0.8, -0.5, SUN, AMB, 0, false);
    }
    expect(spray.activeCount).toBe(0);

    // Rough sea during swell trough: zero reef emissions
    for (let i = 0; i < 8; i++) {
      spray.step(0.05, tTrough, 0.8, 0.8, -0.5, SUN, AMB, 0, false);
    }
    expect(spray.activeCount).toBe(0);

    // Rough sea on arriving crest: emits reef plumes (kind === 1)
    for (let i = 0; i < 6; i++) {
      spray.step(0.05, tCrest, 0.8, 0.8, -0.5, SUN, AMB, 0, false);
    }
    expect(spray.activeCount).toBeGreaterThan(0);
    const meta = spray.mesh.geometry.getAttribute("aMeta").array as Float32Array;
    expect(meta[2]).toBe(1);

    spray.dispose();
  });

  it("gates galley oar splashes strictly to camDist < 140 m", () => {
    const spray = new SpraySystem();

    // At or beyond 140 m: strictly skipped
    spray.beginFrame();
    spray.pushOar(20, 10, 0, 2.5, 4.0, OAR_SPRAY_MAX_DIST);
    spray.pushOar(40, 15, 0, 3.0, 4.2, 220);
    expect(spray.queuedOarCount).toBe(0);
    spray.step(0.05, 1.0, 0.2, 0.2, 0.1, SUN, AMB, 0, false);
    expect(spray.activeCount).toBe(0);

    // Within 140 m: emits crisp low-arc oar droplets (kind === 2)
    spray.beginFrame();
    spray.pushOar(20, 10, 0, 2.5, 4.0, 65);
    expect(spray.queuedOarCount).toBe(1);
    spray.step(0.05, 1.05, 0.2, 0.2, 0.1, SUN, AMB, 0, false);
    expect(spray.activeCount).toBeGreaterThan(0);
    const meta = spray.mesh.geometry.getAttribute("aMeta").array as Float32Array;
    expect(meta[2]).toBe(2);

    spray.dispose();
  });

  it("applies ballistic gravity, culls aged/submerged particles, and freezes under reduced motion", () => {
    const spray = new SpraySystem();
    spray.beginFrame();
    spray.pushBow(0, 0, 0, 3.5, 10, 3.5, 1.2, 0, 0);
    spray.step(0.05, 0.05, 0.6, 0.6, 0, SUN, AMB, 0.2, false);
    const initialCount = spray.activeCount;
    expect(initialCount).toBeGreaterThan(0);

    const posAttr = spray.mesh.geometry.getAttribute("aPosSize") as THREE.InstancedBufferAttribute;
    const snapX = posAttr.array[0];
    const snapY = posAttr.array[1];
    const snapZ = posAttr.array[2];

    // Under reduced motion: particle state freezes completely and no new particles spawn
    spray.beginFrame();
    spray.pushBow(0, 0, 0, 3.5, 10, 3.5, 1.2, 0, 0);
    spray.step(0.1, 0.15, 0.6, 0.6, 0, SUN, AMB, 0.2, true);
    expect(spray.activeCount).toBe(initialCount);
    expect(posAttr.array[0]).toBe(snapX);
    expect(posAttr.array[1]).toBe(snapY);
    expect(posAttr.array[2]).toBe(snapZ);

    // Without further emissions, ballistic gravity & lifetime cull all particles to 0
    for (let i = 0; i < 40; i++) {
      spray.beginFrame();
      spray.step(0.05, 0.2 + i * 0.05, 0.0, 0.6, 0, SUN, AMB, 0.2, false);
    }
    expect(spray.activeCount).toBe(0);
    expect(spray.mesh.geometry.instanceCount).toBe(0);
    expect(spray.mesh.visible).toBe(false);

    // Clean disposal detaches from parent scene
    const scene = new THREE.Scene();
    scene.add(spray.mesh);
    expect(scene.getObjectByName("ocean-spray")).toBe(spray.mesh);
    spray.dispose();
    expect(scene.getObjectByName("ocean-spray")).toBeUndefined();
  });

  it("spawns, culls, and fades particles relative to displaced wave height (crest vs trough)", () => {
    expect(SPRAY_VERT).toContain("attribute float aWaterY;");
    expect(SPRAY_FRAG).toContain("smoothstep(-0.32, 0.22, vWorld.y - vWaterY)");

    // Crest (+0.9 m): bow droplets spawn above +0.9 m and record aWaterY = +0.9
    const sprayCrest = new SpraySystem();
    sprayCrest.beginFrame();
    sprayCrest.pushBow(0, 0, 0, 4.0, 10, 4.0, 1.5, 0, 0);
    sprayCrest.step(0.05, 0.05, 0.85, 0.4, 0, SUN, AMB, 0, false, () => 0.9);
    expect(sprayCrest.activeCount).toBeGreaterThan(0);
    const posCrest = sprayCrest.mesh.geometry.getAttribute("aPosSize").array as Float32Array;
    const wyCrest = sprayCrest.mesh.geometry.getAttribute("aWaterY").array as Float32Array;
    for (let i = 0; i < sprayCrest.activeCount; i++) {
      expect(posCrest[i * 4 + 1]).toBeGreaterThan(0.9);
      expect(wyCrest[i]).toBeCloseTo(0.9, 5);
    }

    // Trough (-0.9 m): a falling droplet at y = -0.50 m stays alive above a -0.9 m trough,
    // whereas the exact same droplet at y = -0.50 m is culled as submerged below a +0.9 m crest
    const sprayTrough = new SpraySystem();
    sprayTrough.beginFrame();
    sprayTrough.pushBow(0, 0, 0, 4.0, 10, 4.0, 1.5, 0, 0);
    sprayTrough.step(0.05, 0.05, 0.85, 0.4, 0, SUN, AMB, 0, false, () => -0.9);
    expect(sprayTrough.activeCount).toBeGreaterThan(0);
    const posTrough = sprayTrough.mesh.geometry.getAttribute("aPosSize").array as Float32Array;
    const wyTrough = sprayTrough.mesh.geometry.getAttribute("aWaterY").array as Float32Array;
    // All trough-spawned droplets start near -0.9 + [0.24..0.72] < -0.15 (would have died under fixed y = 0!)
    expect(posTrough[1]).toBeLessThan(0);
    expect(wyTrough[0]).toBeCloseTo(-0.9, 5);
    // Stepping once more over the -0.9 m trough keeps them alive; switching water to +0.9 m crest culls them immediately
    sprayTrough.beginFrame();
    sprayTrough.step(0.016, 0.066, 0.85, 0.4, 0, SUN, AMB, 0, false, () => -0.9);
    expect(sprayTrough.activeCount).toBeGreaterThan(0);
    sprayTrough.beginFrame();
    sprayTrough.step(0.016, 0.082, 0.85, 0.4, 0, SUN, AMB, 0, false, () => 0.9);
    expect(sprayTrough.activeCount).toBe(0);

    sprayCrest.dispose();
    sprayTrough.dispose();
  });

  it("emits balanced port and starboard galley oar spray at 60 Hz and reuses updateRanges with zero allocations", () => {
    const spray = new SpraySystem();
    const posAttr = spray.mesh.geometry.getAttribute("aPosSize") as THREE.InstancedBufferAttribute;
    const metaAttr = spray.mesh.geometry.getAttribute("aMeta") as THREE.InstancedBufferAttribute;
    let portSeen = 0;
    let stbdSeen = 0;
    let firstPosRange: unknown = null;
    let firstMetaRange: unknown = null;

    // Galley moving along +Z at 2.2 m/s, 50 m from camera, 300 frames @ 60 Hz with rotating oar phase
    for (let f = 0; f < 300; f++) {
      const t = f / 60;
      const before = spray.activeCount;
      spray.beginFrame();
      spray.pushOar(0, 0, 0, 2.2, 4.0, 50, t * Math.PI);
      spray.step(1 / 60, t, 0.1, 0, 0, SUN, AMB, 0, 1.0);
      if (spray.activeCount > 0) {
        if (!firstPosRange) firstPosRange = posAttr.updateRanges[0];
        if (!firstMetaRange) firstMetaRange = metaAttr.updateRanges[0];
        expect(posAttr.updateRanges[0]).toBe(firstPosRange);
        expect(metaAttr.updateRanges[0]).toBe(firstMetaRange);
      }
      // Inspect newly spawned droplets (placed at indices >= before when under capacity)
      for (let i = before; i < spray.activeCount; i++) {
        const px = posAttr.array[i * 4]!;
        if (px > 0.5) stbdSeen++;
        else if (px < -0.5) portSeen++;
      }
    }

    expect(portSeen).toBeGreaterThan(30);
    expect(stbdSeen).toBeGreaterThan(30);
    expect(Math.abs(portSeen - stbdSeen)).toBeLessThanOrEqual(4);
    spray.dispose();
  });
});
