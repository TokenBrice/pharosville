import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLANAR_CLIP_Y,
  PLANAR_FADE,
  PLANAR_STRENGTH,
  PLANAR_WOBBLE,
  PlanarMirror,
  applyObliqueClip,
  planarTargetSize,
  syncMirrorCamera,
} from "./planar-mirror";
import { LAYER_REFLECT, enableLightReflectLayer, enableReflectLayer } from "./reflect-layer";

const GL = {
  READ_FRAMEBUFFER: 0x8ca8,
  SCISSOR_TEST: 0x0c11,
};

function makeHeartCamera(): { camera: THREE.PerspectiveCamera; target: THREE.Vector3 } {
  const camera = new THREE.PerspectiveCamera(25, 1600 / 1000, 5, 9000);
  const target = new THREE.Vector3(0, 0, 0);
  camera.position.set(350, 280, 350);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return { camera, target };
}

function projectToNdc(cam: THREE.PerspectiveCamera, p: THREE.Vector3): THREE.Vector3 {
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const clip = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(vp);
  return new THREE.Vector3(clip.x / clip.w, clip.y / clip.w, clip.z / clip.w);
}

function makeMockRenderer(css: [number, number] = [1600, 1000], scissorInit = false) {
  let currentTarget: THREE.WebGLRenderTarget | null = null;
  let clearColor = new THREE.Color(0x112233);
  let clearAlpha = 0.75;
  let scissorEnabled = scissorInit;
  let shadowEnabledMutated = false;
  let shadowEnabled = true;
  const events: string[] = [];
  const renderShadowStates: Array<{ autoUpdate: boolean; needsUpdate: boolean; enabled: boolean }> = [];
  const renderSceneStates: Array<{ bg: unknown; fog: unknown; camLayersMask: number }> = [];

  const gl = {
    ...GL,
    isEnabled: vi.fn((cap: number) => (cap === GL.SCISSOR_TEST ? scissorEnabled : false)),
    enable: vi.fn((cap: number) => {
      if (cap === GL.SCISSOR_TEST) {
        scissorEnabled = true;
        events.push("gl.enable:SCISSOR");
      }
    }),
    disable: vi.fn((cap: number) => {
      if (cap === GL.SCISSOR_TEST) {
        scissorEnabled = false;
        events.push("gl.disable:SCISSOR");
      }
    }),
  };

  const state = {
    bindFramebuffer: vi.fn((target: number, fbo: WebGLFramebuffer | null) => {
      events.push(`state.bindFbo:${target === GL.READ_FRAMEBUFFER ? "READ" : target}:${fbo === null ? "null" : "fbo"}`);
      return true;
    }),
    setScissorTest: vi.fn((enabled: boolean) => {
      scissorEnabled = enabled;
      events.push(`state.setScissorTest:${enabled}`);
    }),
    reset: vi.fn(() => {
      events.push("state.reset");
    }),
  };

  const shadowMap = {
    autoUpdate: true,
    needsUpdate: true,
    get enabled() {
      return shadowEnabled;
    },
    set enabled(v: boolean) {
      shadowEnabledMutated = true;
      shadowEnabled = v;
    },
  };

  const renderer = {
    css,
    autoClear: true,
    fail: false,
    shadowMap,
    state,
    events,
    renderShadowStates,
    renderSceneStates,
    getContext: () => gl,
    getSize: (v: THREE.Vector2) => v.set(renderer.css[0], renderer.css[1]),
    getRenderTarget: () => currentTarget,
    setRenderTarget: vi.fn((t: THREE.WebGLRenderTarget | null) => {
      currentTarget = t;
      events.push(`setRenderTarget:${t ? t.texture.name || "rt" : "null"}`);
    }),
    getClearColor: (out: THREE.Color) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: vi.fn((c: THREE.Color | number, a = 1) => {
      clearColor = new THREE.Color(c);
      clearAlpha = a;
    }),
    clear: vi.fn(() => {
      events.push("clear");
    }),
    render: vi.fn((scene: THREE.Scene, cam: THREE.Camera) => {
      events.push("render");
      renderShadowStates.push({
        autoUpdate: shadowMap.autoUpdate,
        needsUpdate: shadowMap.needsUpdate,
        enabled: shadowMap.enabled,
      });
      renderSceneStates.push({
        bg: scene.background,
        fog: scene.fog,
        camLayersMask: cam.layers.mask,
      });
      if (renderer.fail) throw new Error("planar gpu fail");
    }),
    getScissor: () => scissorEnabled,
    wasShadowEnabledMutated: () => shadowEnabledMutated,
  };

  return renderer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reflect-layer helpers (C3 / M7)", () => {
  it("enables LAYER_REFLECT on renderables only and enables lights without altering castShadow", () => {
    expect(LAYER_REFLECT).toBe(1);

    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    const inst = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 2);
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    const pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    const lod = new THREE.LOD();
    const subGroup = new THREE.Group();
    const lightInRoot = new THREE.PointLight(0xffffff, 1);
    lightInRoot.castShadow = true;

    subGroup.add(mesh, inst, line, pts, sprite, lod, lightInRoot);
    root.add(subGroup);

    enableReflectLayer(root);

    const mirrorMask = new THREE.Layers();
    mirrorMask.set(LAYER_REFLECT);

    expect(mesh.layers.test(mirrorMask)).toBe(true);
    expect(inst.layers.test(mirrorMask)).toBe(true);
    expect(line.layers.test(mirrorMask)).toBe(true);
    expect(pts.layers.test(mirrorMask)).toBe(true);
    expect(sprite.layers.test(mirrorMask)).toBe(true);
    expect(lod.layers.test(mirrorMask)).toBe(true);
    // Plain groups and lights are not touched by enableReflectLayer
    expect(root.layers.test(mirrorMask)).toBe(false);
    expect(subGroup.layers.test(mirrorMask)).toBe(false);
    expect(lightInRoot.layers.test(mirrorMask)).toBe(false);
    // Layer 0 remains enabled on meshes so main camera still sees them
    const mainMask = new THREE.Layers();
    mainMask.set(0);
    expect(mesh.layers.test(mainMask)).toBe(true);

    enableLightReflectLayer(lightInRoot);
    expect(lightInRoot.layers.test(mirrorMask)).toBe(true);
    expect(lightInRoot.layers.test(mainMask)).toBe(true);
    expect(lightInRoot.castShadow).toBe(true);

    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    inst.geometry.dispose();
    (inst.material as THREE.Material).dispose();
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
    pts.geometry.dispose();
    (pts.material as THREE.Material).dispose();
    (sprite.material as THREE.Material).dispose();
  });
});

describe("PlanarMirror oblique camera math (Lengyel 2005 / M7)", () => {
  it("builds a strictly right-handed mirror camera with identical far and exact Lengyel oblique near-plane clip", () => {
    const { camera: mainCam, target } = makeHeartCamera();
    const mirrorCam = new THREE.PerspectiveCamera();

    const clipped = syncMirrorCamera(mirrorCam, mainCam, target, PLANAR_CLIP_Y);
    expect(clipped).toBe(true);

    // Strictly right-handed (zero winding flip) and identical far (never 2600!)
    expect(mirrorCam.matrixWorld.determinant()).toBeGreaterThan(0.999);
    expect(mirrorCam.far).toBe(mainCam.far);
    expect(mirrorCam.far).toBe(9000);
    expect(mirrorCam.near).toBe(mainCam.near);
    expect(mirrorCam.fov).toBe(mainCam.fov);
    expect(mirrorCam.aspect).toBe(mainCam.aspect);
    expect(mirrorCam.position.toArray()).toEqual([350, -280, 350]);

    // Point ON the clip plane (0, -0.08, 0) projects to ndc.z ≈ -1.0 (±1e-4)
    const onPlane = projectToNdc(mirrorCam, new THREE.Vector3(0, PLANAR_CLIP_Y, 0));
    expect(onPlane.z).toBeCloseTo(-1.0, 4);

    // Point ABOVE water (0, +25, 0) is KEPT (-1 < ndc.z < 1)
    const above = projectToNdc(mirrorCam, new THREE.Vector3(0, 25, 0));
    expect(above.z).toBeGreaterThan(-1.0);
    expect(above.z).toBeLessThan(1.0);

    // Point UNDERWATER (0, -2.5, 0) is CLIPPED (ndc.z < -1)
    const under = projectToNdc(mirrorCam, new THREE.Vector3(0, -2.5, 0));
    expect(under.z).toBeLessThan(-1.0);

    // Distant cliff (0, +60, -1500) is NOT far-clipped (-1 < ndc.z < 1)
    const farCliff = projectToNdc(mirrorCam, new THREE.Vector3(0, 60, -1500));
    expect(farCliff.z).toBeGreaterThan(-1.0);
    expect(farCliff.z).toBeLessThan(1.0);
  });

  it("aligns uPlanarVP water-plane UVs identically with reflected above-water geometry rays", () => {
    const { camera: mainCam, target } = makeHeartCamera();
    const mirrorCam = new THREE.PerspectiveCamera();
    syncMirrorCamera(mirrorCam, mainCam, target, PLANAR_CLIP_Y);

    const vp = new THREE.Matrix4().multiplyMatrices(mirrorCam.projectionMatrix, mirrorCam.matrixWorldInverse);
    const toUv = (p: THREE.Vector3) => {
      const c = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(vp);
      return new THREE.Vector2((c.x / c.w) * 0.5 + 0.5, (c.y / c.w) * 0.5 + 0.5);
    };

    // An object point L = (10, +40, 20) reflects off water point W_hit where ray mainCam -> (10, -40, 20) crosses Y = 0
    const L = new THREE.Vector3(10, 40, 20);
    const Lmirror = new THREE.Vector3(10, -40, 20);
    const t = mainCam.position.y / (mainCam.position.y - Lmirror.y);
    const W_hit = new THREE.Vector3().lerpVectors(mainCam.position, Lmirror, t);
    expect(W_hit.y).toBeCloseTo(0, 6);

    const uvObj = toUv(L);
    const uvWater = toUv(W_hit);
    expect(uvWater.x).toBeCloseTo(uvObj.x, 5);
    expect(uvWater.y).toBeCloseTo(uvObj.y, 5);

    // And the waterline base (10, 0, 20) maps to identical horizontal NDC in both mainCam and mirrorCam
    const base = new THREE.Vector3(10, 0, 20);
    const ndcMain = projectToNdc(mainCam, base);
    const ndcMirror = projectToNdc(mirrorCam, base);
    expect(ndcMirror.x).toBeCloseTo(ndcMain.x, 5);
  });

  it("safely skips oblique replacement when the mirror camera is parallel to or above the clip plane", () => {
    const cam = new THREE.PerspectiveCamera(45, 1.6, 1, 1000);
    cam.position.set(0, 10, 100);
    cam.lookAt(0, 10, 0); // perfectly horizontal: c.z === 0
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const before = [...cam.projectionMatrix.elements];
    expect(applyObliqueClip(cam, PLANAR_CLIP_Y)).toBe(false);
    expect(cam.projectionMatrix.elements).toEqual(before);
  });
});

describe("PlanarMirror target sizing, state safety, frustum & lifecycle", () => {
  it("sizes target to half CSS (minimum 1×1), never scaled by DPR", () => {
    expect(planarTargetSize(1600, 1000)).toEqual({ width: 800, height: 500 });
    expect(planarTargetSize(1599, 999)).toEqual({ width: 800, height: 500 });
    expect(planarTargetSize(0, 0)).toEqual({ width: 1, height: 1 });
  });

  it("preserves FBO, READ_FRAMEBUFFER, scissor, clear state, scene bg/fog, and never touches shadowMap.enabled or state.reset", () => {
    const mirror = new PlanarMirror();
    const r = makeMockRenderer([1600, 1000], true);
    const scene = new THREE.Scene();
    const bg = new THREE.Color(0x557799);
    const fog = new THREE.FogExp2(0x8899aa, 0.001);
    scene.background = bg;
    scene.fog = fog;
    const { camera, target } = makeHeartCamera();
    const inputBuffer = new THREE.WebGLRenderTarget(3200, 2000);
    inputBuffer.texture.name = "Composer.Input";
    r.setRenderTarget(inputBuffer);
    r.events.length = 0;

    mirror.setActive(true);
    mirror.render(r as unknown as THREE.WebGLRenderer, scene, camera, target, 0.016);

    // Target format & naming invariants
    expect(mirror.texture).not.toBeNull();
    expect(mirror.texture!.name).toBe("PlanarMirror.Target");
    expect(mirror.texture!.type).toBe(THREE.HalfFloatType);
    expect(mirror.texture!.format).toBe(THREE.RGBAFormat);
    expect(mirror.texture!.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(mirror.texture!.magFilter).toBe(THREE.LinearFilter);
    expect(mirror.texture!.generateMipmaps).toBe(true);
    expect(mirror.ready).toBe(true);
    expect(mirror.uniforms.uMirrorTex.value).toBe(mirror.texture);

    // During render: bg & fog nulled, shadow updates disabled WITHOUT mutating shadowMap.enabled, layer = LAYER_REFLECT
    expect(r.renderSceneStates).toHaveLength(1);
    expect(r.renderSceneStates[0].bg).toBeNull();
    expect(r.renderSceneStates[0].fog).toBeNull();
    expect(r.renderSceneStates[0].camLayersMask).toBe(1 << LAYER_REFLECT);
    expect(r.renderShadowStates[0]).toEqual({ autoUpdate: false, needsUpdate: false, enabled: true });
    expect(r.wasShadowEnabledMutated()).toBe(false);
    expect(r.state.reset).not.toHaveBeenCalled();

    // After render: everything restored in exact C1 order (setRenderTarget -> bindFramebuffer(READ, null) -> setScissorTest)
    expect(scene.background).toBe(bg);
    expect(scene.fog).toBe(fog);
    expect(r.shadowMap.autoUpdate).toBe(true);
    expect(r.shadowMap.needsUpdate).toBe(true);
    expect(r.autoClear).toBe(true);
    expect(r.getClearAlpha()).toBe(0.75);
    expect(r.getClearColor(new THREE.Color()).getHex()).toBe(0x112233);
    expect(r.getRenderTarget()).toBe(inputBuffer);
    expect(r.getScissor()).toBe(true);

    const rtIdx = r.events.lastIndexOf("setRenderTarget:Composer.Input");
    const readNullIdx = r.events.lastIndexOf("state.bindFbo:READ:null");
    const scissorIdx = r.events.lastIndexOf("state.setScissorTest:true");
    expect(rtIdx).toBeGreaterThan(-1);
    expect(readNullIdx).toBeGreaterThan(rtIdx);
    expect(scissorIdx).toBeGreaterThan(rtIdx);

    // Restores ALL state even when renderer.render throws mid-pass
    r.fail = true;
    expect(() => mirror.render(r as unknown as THREE.WebGLRenderer, scene, camera, target, 0.016)).toThrow("planar gpu fail");
    expect(scene.background).toBe(bg);
    expect(scene.fog).toBe(fog);
    expect(r.shadowMap.autoUpdate).toBe(true);
    expect(r.shadowMap.needsUpdate).toBe(true);
    expect(r.autoClear).toBe(true);
    expect(r.getRenderTarget()).toBe(inputBuffer);
    expect(r.getScissor()).toBe(true);
    expect(r.wasShadowEnabledMutated()).toBe(false);

    inputBuffer.dispose();
    mirror.dispose();
  });

  it("exposes updateFrustum for H12 fleet posing when active & visible and returns null otherwise", () => {
    const mirror = new PlanarMirror();
    const { camera, target } = makeHeartCamera();

    // Inactive -> null
    expect(mirror.updateFrustum(camera, target)).toBeNull();

    mirror.setActive(true);
    const frustum = mirror.updateFrustum(camera, target);
    expect(frustum).toBeInstanceOf(THREE.Frustum);
    // Above-water ship at harbour center is inside mirror frustum
    expect(frustum!.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0, 15, 0), 8))).toBe(true);
    // Deep underwater sphere is clipped by oblique near plane
    expect(frustum!.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0, -15, 0), 2))).toBe(false);

    // Visibility = 0 (heavy fog/rain) -> null
    mirror.setConditions(1, 0);
    expect(mirror.updateFrustum(camera, target)).toBeNull();

    mirror.dispose();
  });

  it("gates by D-2 fog/rain conditions, fades over PLANAR_FADE, restores fallback before dispose, and cleans up", () => {
    const mirror = new PlanarMirror();
    const r = makeMockRenderer([1600, 1000], false);
    const scene = new THREE.Scene();
    const { camera, target } = makeHeartCamera();
    const fallback = mirror.uniforms.uMirrorTex.value;

    expect(fallback).toBeInstanceOf(THREE.DataTexture);
    expect(mirror.enabled).toBe(false);
    expect(mirror.ready).toBe(false);
    expect(mirror.texture).toBeNull();
    expect(mirror.uniforms.uMirror.value.y).toBe(PLANAR_WOBBLE);

    mirror.setActive(true);
    expect(mirror.enabled).toBe(true);
    expect(mirror.texture).not.toBeNull();

    // Settle fade-in over PLANAR_FADE
    for (let i = 0; i < 4; i++) {
      mirror.render(r as unknown as THREE.WebGLRenderer, scene, camera, target, PLANAR_FADE / 3);
    }
    expect(mirror.uniforms.uMirror.value.x).toBeCloseTo(PLANAR_STRENGTH, 6);

    // D-2 fog/rain suppression & early-out (0 draws when visibility <= 0.001)
    r.render.mockClear();
    mirror.setConditions(0, 0.35);
    mirror.render(r as unknown as THREE.WebGLRenderer, scene, camera, target, 0.016);
    expect(r.render).not.toHaveBeenCalled();
    expect(mirror.uniforms.uMirror.value.x).toBe(0);

    mirror.setConditions(0.5, 0);
    expect(mirror.uniforms.uMirror.value.x).toBeCloseTo(PLANAR_STRENGTH * 0.5, 6);
    mirror.setConditions(0, 0.065);
    expect(mirror.uniforms.uMirror.value.x).toBeCloseTo(PLANAR_STRENGTH, 6);

    // Graceful fade-out disposes RT at zero and restores fallback BEFORE disposal
    const firstTex = mirror.texture!;
    const disposed = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    mirror.setActive(false);
    mirror.render(r as unknown as THREE.WebGLRenderer, scene, camera, target, PLANAR_FADE * 0.4);
    expect(mirror.enabled).toBe(true);
    expect(mirror.uniforms.uMirror.value.x).toBeGreaterThan(0);
    expect(mirror.uniforms.uMirror.value.x).toBeLessThan(PLANAR_STRENGTH);

    for (let i = 0; i < 4; i++) {
      mirror.render(r as unknown as THREE.WebGLRenderer, scene, camera, target, PLANAR_FADE / 3);
    }
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(mirror.enabled).toBe(false);
    expect(mirror.ready).toBe(false);
    expect(mirror.texture).toBeNull();
    expect(mirror.uniforms.uMirrorTex.value).toBe(fallback);
    expect(mirror.uniforms.uMirror.value.x).toBe(0);

    // Re-activate creates a fresh RT; immediate=true cuts & disposes at once
    mirror.setActive(true);
    expect(mirror.texture).not.toBe(firstTex);
    mirror.setActive(false, true);
    expect(disposed).toHaveBeenCalledTimes(2);
    expect(mirror.enabled).toBe(false);
    expect(mirror.uniforms.uMirrorTex.value).toBe(fallback);

    mirror.dispose();
  });

  it("synchronizes both Three.js r186 cache and real GL READ/DRAW bindings after SceneCapture -> PlanarMirror", () => {
    const READ = 0x8ca8;
    const DRAW = 0x8ca9;
    const FB = 0x8d40;
    const srcFbo = { id: "composer-input" } as unknown as WebGLFramebuffer;
    const mirrorFbo = { id: "planar-mirror" } as unknown as WebGLFramebuffer;
    let actualRead: WebGLFramebuffer | null = null;
    let actualDraw: WebGLFramebuffer | null = srcFbo;
    // Exact Three.js r186 WebGLState.js:483 cache model (SceneCapture left cached READ = null)
    const cached: Record<number, WebGLFramebuffer | null> = { [READ]: null, [DRAW]: srcFbo, [FB]: srcFbo };

    const gl = {
      READ_FRAMEBUFFER: READ,
      DRAW_FRAMEBUFFER: DRAW,
      FRAMEBUFFER: FB,
      SCISSOR_TEST: 0x0c11,
      isEnabled: () => false,
      bindFramebuffer(target: number, fbo: WebGLFramebuffer | null) {
        if (target === FB) { actualRead = fbo; actualDraw = fbo; }
        else if (target === READ) actualRead = fbo;
        else if (target === DRAW) actualDraw = fbo;
      },
    };
    const state = {
      bindFramebuffer(target: number, fbo: WebGLFramebuffer | null) {
        if (cached[target] !== fbo) {
          gl.bindFramebuffer(target, fbo);
          cached[target] = fbo;
          if (target === DRAW) cached[FB] = fbo;
          if (target === FB) cached[DRAW] = fbo;
          return true;
        }
        return false;
      },
      setScissorTest: vi.fn(),
    };
    let currentRT: THREE.WebGLRenderTarget | null = null;
    const inputBuffer = new THREE.WebGLRenderTarget(1200, 800);
    const renderer = {
      autoClear: true,
      shadowMap: { autoUpdate: true, needsUpdate: true, enabled: true },
      state,
      getContext: () => gl,
      getSize: (v: THREE.Vector2) => v.set(1200, 800),
      getRenderTarget: () => currentRT,
      setRenderTarget(rt: THREE.WebGLRenderTarget | null) {
        currentRT = rt;
        state.bindFramebuffer(FB, rt === inputBuffer ? srcFbo : rt ? mirrorFbo : null);
      },
      getClearColor: (out: THREE.Color) => out.setHex(0),
      getClearAlpha: () => 1,
      setClearColor: vi.fn(),
      clear: vi.fn(),
      render: vi.fn(),
    };

    const { camera, target } = makeHeartCamera();
    const scene = new THREE.Scene();
    renderer.setRenderTarget(inputBuffer);
    // Simulate SceneCapture having finished and unbound READ_FRAMEBUFFER via Three state
    state.bindFramebuffer(READ, null);
    expect(actualRead).toBeNull();
    expect(cached[READ]).toBeNull();

    const mirror = new PlanarMirror();
    mirror.setActive(true);
    mirror.render(renderer as unknown as THREE.WebGLRenderer, scene, camera, target, 0.016);

    // Without the r186 fallback sync, actualRead would still be srcFbo while cached[READ] was null!
    expect(actualRead).toBeNull();
    expect(cached[READ]).toBeNull();
    expect(actualDraw).toBe(srcFbo);
    expect(cached[DRAW]).toBe(srcFbo);

    inputBuffer.dispose();
    mirror.dispose();
  });
});
