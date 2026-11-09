import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AUDIT_FRAMES, castFadeGlsl, contactShare, FADE_FROM, FIGURE_SHADOW_DIST, shadowShift, ShadowCasters, STALE_PX, type CasterState, type CasterView } from "./shadow-casters";

/** The GLSL dither (castFadeGlsl) in JS: true when the texel at fragment (x, y), map phase (px, py), is discarded. */
function discarded(x: number, y: number, px: number, py: number, fade: number): boolean {
  if (fade <= 0) return false;
  const cx = (((Math.floor(x) + px) % 4) + 4) % 4, cy = (((Math.floor(y) + py) % 4) + 4) % 4;
  const hx = Math.floor(cx * 0.5), hy = Math.floor(cy * 0.5);
  const fract = (v: number) => v - Math.floor(v);
  const b2 = fract(cx * 0.5 + cy * cy * 0.75), b2h = fract(hx * 0.5 + hy * hy * 0.75);
  return b2 + b2h * 0.25 + 0.03125 < fade;
}

describe("E05 handover share and dither", () => {
  it("hands each family over between FADE_FROM× and 1× its limit, continuously across the 640 m fleet limit", () => {
    expect(contactShare(FADE_FROM * 640 - 1, 640)).toBe(0);
    expect(contactShare(640, 640)).toBe(1);
    expect(contactShare(641, 640)).toBe(1);
    expect(contactShare(639, 640)).toBeGreaterThan(0.999);   // 639 ↔ 641: no step left at the limit
    let last = 0;
    for (let d = 500; d <= 700; d += 0.5) {
      const s = contactShare(d, 640);
      expect(s).toBeGreaterThanOrEqual(last);
      expect(s - last).toBeLessThan(0.02);   // no step anywhere in the band
      last = s;
    }
    expect(contactShare(FIGURE_SHADOW_DIST, FIGURE_SHADOW_DIST)).toBe(1);
  });

  it("keeps exactly 1 − fade of every 4×4 texel tile, the same texels whatever the map's world phase", () => {
    const thresholds = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      let k = 0;
      while (k < 16 && !discarded(x, y, 0, 0, (k + 1) / 16 + 1e-6)) k++;
      thresholds.add(k);
    }
    expect([...thresholds].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));   // a permutation of 16 levels
    for (let k = 0; k <= 16; k++) {
      let dropped = 0;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (discarded(x + 0.5, y + 0.5, 0, 0, k / 16 + 1e-6)) dropped++;
      expect(dropped).toBe(k);
    }
    expect(discarded(2.5, 3.5, 0, 0, 0)).toBe(false);
    expect(discarded(2.5, 3.5, 0, 0, 1)).toBe(true);
    // the map moved one texel left (its first column is one global texel further on): the same world texel keeps its verdict
    for (let gx = -6; gx < 6; gx++) for (let gy = -6; gy < 6; gy++) for (const p of [0, 1, 2, 3]) {
      expect(discarded(gx - p + 0.5, gy + 0.5, p, 0, 0.55)).toBe(discarded(gx + 0.5, gy + 0.5, 0, 0, 0.55));
    }
    const glsl = castFadeGlsl("uHbFleetFade");
    expect(glsl.pars).toContain("uniform float uHbFleetFade;");
    expect(glsl.discard).toContain("if (uHbFleetFade > 0.0)");
    expect(glsl.discard).toContain("gl_FragCoord.xy");
  });

  it("bounds a caster's shadow shift: slides as they are, rises and turns stretched by the low sun", () => {
    const a = new THREE.Matrix4(), b = new THREE.Matrix4().makeTranslation(0.3, 0, 0.4);
    expect(shadowShift(a.elements, b.elements, new THREE.Vector3(), 2, 8)).toBeCloseTo(0.5, 9);
    b.makeTranslation(0, 0.1, 0);
    expect(shadowShift(a.elements, b.elements, new THREE.Vector3(), 0, 3)).toBeCloseTo(0.3, 9);
    b.makeRotationY(0.01);
    const turn = shadowShift(a.elements, b.elements, new THREE.Vector3(), 3, 0);
    expect(turn).toBeGreaterThanOrEqual(0.03 * 0.99);   // a rim point 3 m out moves ~0.03 m
    expect(shadowShift(a.elements, a.elements, new THREE.Vector3(1, 2, 3), 5, 8)).toBe(0);
  });
});

/** A camera 650 m from the origin (the landing distance), a 1000 px tall view and a 45° sun. */
function view(frustum: THREE.Frustum | null = null): CasterView {
  const camera = new THREE.PerspectiveCamera(25, 1.6, 1, 20000);
  camera.position.set(0, 285, 584); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  return { camera, viewHeight: 1000, sun: new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2), frustum };
}

function world() {
  const scene = new THREE.Scene(), casters = new ShadowCasters(), v = view(), out: CasterState = { live: false, changed: false };
  casters.attach(scene);
  const check = () => { scene.updateMatrixWorld(); return { ...casters.check(scene, v, out) }; };
  /** SunRig's side: a render was requested this frame */
  const draw = () => casters.drawn(v);
  return { scene, casters, v, check, draw };
}

function caster(name = "c") {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
  mesh.name = name; mesh.castShadow = true;
  return mesh;
}

describe("E05 caster census", () => {
  it("re-renders for a new static caster, then holds while nothing it holds changes", () => {
    const w = world(), box = caster();
    w.scene.add(box);
    expect(w.check()).toEqual({ live: false, changed: true });
    w.draw();
    for (let i = 0; i < AUDIT_FRAMES * 3; i++) expect(w.check()).toEqual({ live: false, changed: false });
    expect(w.casters.size).toBe(1);
  });

  it("never re-renders for sub-pixel easing, and re-renders a visible move at once, then at the cadence, then on settling", () => {
    const w = world(), box = caster();
    w.scene.add(box); w.check(); w.draw();
    // ~0.5 CSS px at 650 m is ~0.15 m: a millimetre creep (a float easing to its reading) stays held however long it creeps
    for (let i = 0; i < 100; i++) { box.position.y += 1e-5; expect(w.check()).toEqual({ live: false, changed: false }); }
    expect(w.check()).toEqual({ live: false, changed: false });   // the creep settled below the threshold: nothing to redraw
    box.position.x += 1; expect(w.check()).toEqual({ live: false, changed: true });   // started: now
    w.draw();
    box.position.x += 1; expect(w.check()).toEqual({ live: true, changed: false });   // ongoing: at the tier cadence
    box.position.x += 1; expect(w.check()).toEqual({ live: true, changed: false });   // (not redrawn: still stale)
    expect(w.check()).toEqual({ live: false, changed: true });                        // settled, stale: once more, now
    w.draw();
    expect(w.check()).toEqual({ live: false, changed: false });
    expect(STALE_PX).toBeGreaterThan(0);
  });

  it("ignores a caster's motion while it stays outside the light frustum", () => {
    const scene = new THREE.Scene(), casters = new ShadowCasters(), out: CasterState = { live: false, changed: false };
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().makeOrthographic(-10, 10, 10, -10, 0.1, 100));
    const v = view(frustum), box = caster();
    box.position.set(500, 0, 0);
    scene.add(box); scene.updateMatrixWorld(); casters.check(scene, v, out); casters.drawn(v);
    box.position.x += 5; scene.updateMatrixWorld();
    expect(casters.check(scene, v, out)).toEqual({ live: false, changed: false });
  });

  it("re-renders on hide / show, geometry rewrites, depth material changes and removal", () => {
    const w = world(), box = caster(), group = new THREE.Group();
    group.add(box); w.scene.add(group); w.check(); w.draw();
    // one event at a time (a quiet frame after each: consecutive changes are one ongoing change, redrawn at the cadence)
    const event = (apply: () => void) => {
      apply(); const now = w.check(); w.draw();
      expect(w.check()).toEqual({ live: false, changed: false });
      return now.changed;
    };
    expect(event(() => { group.visible = false; })).toBe(true);
    expect(event(() => { group.visible = true; })).toBe(true);
    expect(event(() => { box.geometry.index!.needsUpdate = true; })).toBe(true);   // a launch rewriting the yard's index
    expect(event(() => { box.geometry.setDrawRange(0, 12); })).toBe(true);
    expect(event(() => { box.customDepthMaterial = new THREE.MeshDepthMaterial(); })).toBe(true);
    expect(event(() => { box.customDepthMaterial!.needsUpdate = true; })).toBe(true);   // a season recompile
    expect(event(() => { box.castShadow = false; })).toBe(true);
    expect(event(() => { box.castShadow = true; })).toBe(true);
    box.geometry.index!.needsUpdate = true; expect(w.check()).toEqual({ live: false, changed: true });
    box.geometry.index!.needsUpdate = true; expect(w.check()).toEqual({ live: true, changed: false });   // ongoing (storm cones)
    w.draw();
    w.scene.remove(group);   // a direct scene removal audits at once
    expect(w.check().changed).toBe(true);
    expect(w.casters.size).toBe(0);
  });

  it("finds a nested caster at the next audit and treats an unregistered batch as moving", () => {
    const w = world(), holder = new THREE.Group();
    w.scene.add(holder); w.check(); w.draw();
    holder.add(caster("late"));   // not a direct scene child: found by the periodic audit
    let found = false;
    for (let i = 0; i <= AUDIT_FRAMES && !found; i++) found = w.check().changed;
    expect(found).toBe(true);
    const batch = new THREE.BatchedMesh(1, 3, 3, new THREE.MeshStandardMaterial());
    batch.castShadow = true; w.scene.add(batch);
    w.check(); w.draw();
    expect(w.check().live).toBe(true);
  });

  it("keeps a dynamic caster live while in the map, re-rendering at once on entry and exit", () => {
    const w = world(), hulls = caster("harbour-fleet");
    hulls.castShadow = false;
    w.check();   // the first check always renders once
    const unregister = w.casters.dynamic(hulls);
    w.scene.add(hulls);
    expect(w.check()).toEqual({ live: false, changed: false });
    hulls.castShadow = true;
    expect(w.check()).toEqual({ live: true, changed: true });    // entered: now
    expect(w.check()).toEqual({ live: true, changed: false });   // in: tier cadence
    hulls.castShadow = false;
    expect(w.check()).toEqual({ live: false, changed: true });   // left: once more, without it
    expect(w.check()).toEqual({ live: false, changed: false });
    hulls.castShadow = true; w.check();
    unregister();
    expect(w.check().changed).toBe(true);                        // a registered caster in the map went away
  });

  it("re-renders once for a watched depth uniform (the kit twin's leaf fall) and for an invalidation", () => {
    const w = world(), foliage = { value: new THREE.Vector4(0, 1, 0, 0) }, phase = { value: 0.5 };
    w.casters.watch(foliage); w.casters.watch(phase); w.casters.watch(phase);
    w.check();
    expect(w.check().changed).toBe(false);
    foliage.value.set(0, 0.6, 0.4, 0);
    expect(w.check().changed).toBe(true);
    expect(w.check().changed).toBe(false);
    phase.value = 0.51;
    expect(w.check().changed).toBe(true);
    w.casters.invalidate();
    expect(w.check().changed).toBe(true);
    expect(w.check().changed).toBe(false);
  });

  it("gates a shown figure crowd's shadow by zoom, leaving a crowd still being prepared alone", () => {
    const w = world();
    const folk = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 4);
    folk.castShadow = true;
    const root = new THREE.Group(); root.add(folk); w.scene.add(root);
    const undo = w.casters.figures(folk, 1.75);
    expect([...w.casters.crowds].map((c) => c.height)).toEqual([1.75]);
    root.visible = false;   // a deferred system hides its additions until its programs (castShadow on) are prepared
    w.casters.gateFigures(650, w.scene);
    expect(folk.castShadow).toBe(true);
    root.visible = true;
    w.casters.gateFigures(FIGURE_SHADOW_DIST + 1, w.scene);
    expect(folk.castShadow).toBe(false);
    w.casters.gateFigures(FIGURE_SHADOW_DIST - 1, w.scene);
    expect(folk.castShadow).toBe(true);
    expect(w.check()).toEqual({ live: true, changed: true });
    undo();
    expect(w.casters.crowds.size).toBe(0);
  });
});
