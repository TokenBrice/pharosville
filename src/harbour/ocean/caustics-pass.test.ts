import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  CAUSTICS_FRAG,
  CAUSTICS_HALF_EXTENT,
  CAUSTICS_MESH_N,
  CAUSTICS_REF_Y,
  CAUSTICS_RES,
  CAUSTICS_SNAP,
  CAUSTICS_VERT,
  CausticsPass,
  causticsBoundsFor,
} from "./caustics-pass";

function makeShared() {
  return {
    uTime: { value: 1.5 },
    uSea: { value: new THREE.Vector4(0.24, 0.55, 0.0, 1.0) },
    uSdf: { value: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) },
    uSdfBounds: { value: new THREE.Vector4(-640, -640, 640, 640) },
    uSceneCenter: { value: new THREE.Vector2(0, 0) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() },
  };
}

function fakeRenderer() {
  let target: THREE.WebGLRenderTarget | null = null;
  let clearColor = new THREE.Color(0x223344);
  let clearAlpha = 0.65;
  return {
    autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: vi.fn((t: THREE.WebGLRenderTarget | null) => { target = t; }),
    getClearColor: (out: THREE.Color) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: vi.fn((c: THREE.Color | number, a = 1) => { clearColor = new THREE.Color(c); clearAlpha = a; }),
    clear: vi.fn(),
    render: vi.fn(),
  };
}

describe("CausticsPass (Phase 1 WS1.5: H1 / H10 / D-7)", () => {
  it("snaps causticsBoundsFor to 2 m increments spanning an exact 256 m × 256 m target-centered window", () => {
    expect(CAUSTICS_RES).toBe(1024);
    expect(CAUSTICS_MESH_N).toBe(384);
    expect(CAUSTICS_HALF_EXTENT).toBe(128);
    expect(CAUSTICS_SNAP).toBe(2);
    expect(CAUSTICS_REF_Y).toBe(-3.0);

    const b0 = causticsBoundsFor(0, 0);
    expect(b0).toEqual([-128, -128, 128, 128]);
    expect(b0[2] - b0[0]).toBe(256);
    expect(b0[3] - b0[1]).toBe(256);

    // 2 m world snap around rig.target
    expect(causticsBoundsFor(12.6, -15.2)).toEqual([12 - 128, -16 - 128, 12 + 128, -16 + 128]);
    expect(causticsBoundsFor(13.1, -14.9)).toEqual([14 - 128, -14 - 128, 14 + 128, -14 + 128]);

    // Writes into caller-provided scratch tuple without allocating
    const scratch: [number, number, number, number] = [0, 0, 0, 0];
    const ret = causticsBoundsFor(-33.4, 41.8, scratch);
    expect(ret).toBe(scratch);
    expect(scratch).toEqual([-34 - 128, 42 - 128, -34 + 128, 42 + 128]);
    expect(scratch[2] - scratch[0]).toBe(256);
    expect(scratch[3] - scratch[1]).toBe(256);
  });

  it("allocates a 1024×1024 R16F RT strictly on High and restores the 1×1 black fallback before disposal on deactivation", () => {
    const pass = new CausticsPass(makeShared());
    const fallback = pass.uniforms.uCausticMap.value;
    expect(pass.target).toBeNull();
    expect(fallback).toBeInstanceOf(THREE.DataTexture);
    expect(pass.uniforms.uCausticMode.value).toBe(0);

    // Entering High allocates 1024×1024 R16F without depth/stencil/mipmaps
    pass.setActive(true);
    pass.setMode(2);
    expect(pass.uniforms.uCausticMode.value).toBe(2);
    expect(pass.target).not.toBeNull();
    const rt = pass.target!;
    expect([rt.width, rt.height]).toEqual([1024, 1024]);
    expect(rt.depthBuffer).toBe(false);
    expect(rt.stencilBuffer).toBe(false);
    expect(rt.texture.format).toBe(THREE.RedFormat);
    expect(rt.texture.type).toBe(THREE.HalfFloatType);
    expect(rt.texture.generateMipmaps).toBe(false);
    expect(rt.texture.minFilter).toBe(THREE.LinearFilter);
    expect(rt.texture.magFilter).toBe(THREE.LinearFilter);
    expect(rt.texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(rt.texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(rt.texture.name).toBe("CausticsPass.Map");
    expect(pass.uniforms.uCausticMap.value).toBe(rt.texture);

    // Leaving High restores fallback BEFORE disposing the RT (0 MB VRAM on Medium/Low)
    let fallbackRestoredBeforeDispose = false;
    const disposed = vi.fn(() => {
      fallbackRestoredBeforeDispose = pass.uniforms.uCausticMap.value === fallback;
    });
    rt.addEventListener("dispose", disposed);
    pass.setActive(false);
    pass.setMode(1);
    expect(disposed).toHaveBeenCalledOnce();
    expect(fallbackRestoredBeforeDispose).toBe(true);
    expect(pass.target).toBeNull();
    expect(pass.uniforms.uCausticMap.value).toBe(fallback);
    expect(pass.uniforms.uCausticMode.value).toBe(1);

    pass.setMode(0);
    expect(pass.uniforms.uCausticMode.value).toBe(0);
    pass.dispose();
  });

  it("enforces H10 material invariants: hb_caustics, DoubleSide, additive ONE/ONE blending, no depth test/write", () => {
    const pass = new CausticsPass(makeShared());
    const mat = pass.mesh.material;
    expect(mat.name).toBe("hb_caustics");
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.depthTest).toBe(false);
    expect(mat.depthWrite).toBe(false);
    expect(mat.transparent).toBe(true);
    expect(mat.fog).toBe(false);
    expect(mat.blending).toBe(THREE.CustomBlending);
    expect(mat.blendEquation).toBe(THREE.AddEquation);
    expect(mat.blendSrc).toBe(THREE.OneFactor);
    expect(mat.blendDst).toBe(THREE.OneFactor);
    expect(pass.mesh.frustumCulled).toBe(false);

    // Verify shader math contracts
    expect(CAUSTICS_VERT).toContain("gerstnerSums(");
    expect(CAUSTICS_VERT).toContain("gerstnerNormalOf(");
    expect(CAUSTICS_VERT).toContain("refract(-sunDir, N_wave, 0.75)");
    expect(CAUSTICS_VERT).toContain("smoothstep(470.0, 560.0, length(xz - uSceneCenter))");
    expect(CAUSTICS_FRAG).toContain("dFdx(vOldPos)");
    expect(CAUSTICS_FRAG).toContain("dFdy(vOldPos)");
    expect(CAUSTICS_FRAG).toContain("dFdx(vNewPos)");
    expect(CAUSTICS_FRAG).toContain("dFdy(vNewPos)");
    expect(CAUSTICS_FRAG).toContain("gl_FragColor = vec4(intensity, 0.0, 0.0, 1.0);");
    pass.dispose();
  });

  it("allocates the 384×384 Uint32Array grid strictly on High and disposes it back to a placeholder off High", () => {
    const pass = new CausticsPass(makeShared());
    // Off-High starts with tiny 1-triangle placeholder (0 MB production grid)
    const placeholder = pass.mesh.geometry;
    expect((placeholder.getAttribute("position") as THREE.BufferAttribute).count).toBe(3);

    pass.setActive(true);
    const geo = pass.mesh.geometry;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const idx = geo.getIndex();

    const expectedVerts = (CAUSTICS_MESH_N + 1) * (CAUSTICS_MESH_N + 1);
    const expectedIndices = CAUSTICS_MESH_N * CAUSTICS_MESH_N * 6;
    expect(expectedVerts).toBeGreaterThan(65535);
    expect(pos.count).toBe(expectedVerts);
    expect(idx).not.toBeNull();
    expect(idx!.array).toBeInstanceOf(Uint32Array);
    expect(idx!.count).toBe(expectedIndices);

    // Corner vertices span [0, 1]^2 exactly
    expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([0, 0, 0]);
    expect([pos.getX(expectedVerts - 1), pos.getY(expectedVerts - 1), pos.getZ(expectedVerts - 1)]).toEqual([1, 1, 0]);

    // Highest index equals last vertex (no 16-bit wraparound)
    let maxIdx = 0;
    const arr = idx!.array as Uint32Array;
    for (let i = 0; i < arr.length; i++) if (arr[i] > maxIdx) maxIdx = arr[i];
    expect(maxIdx).toBe(expectedVerts - 1);

    // Downgrading off High disposes the 384² grid and restores placeholder
    const onGridDispose = vi.fn();
    geo.addEventListener("dispose", onGridDispose);
    pass.setActive(false);
    expect(onGridDispose).toHaveBeenCalledOnce();
    expect(pass.mesh.geometry).toBe(placeholder);

    pass.dispose();
  });

  it("saves & restores renderer state, skips inactive/night frames, and clears once on day-to-night transition", () => {
    const pass = new CausticsPass(makeShared());
    const r = fakeRenderer();
    const prev = new THREE.WebGLRenderTarget(16, 16);
    r.setRenderTarget(prev);
    r.setRenderTarget.mockClear();

    // Inactive: updates uCausticBounds, performs zero GL calls
    pass.render(r as unknown as THREE.WebGLRenderer, 15.2, -23.7, 0.9);
    expect(pass.uniforms.uCausticBounds.value.toArray()).toEqual([16 - 128, -24 - 128, 16 + 128, -24 + 128]);
    expect(r.clear).not.toHaveBeenCalled();
    expect(r.render).not.toHaveBeenCalled();

    // Active at night (fresh RT, never drawn in day): skips clear and draw
    pass.setActive(true);
    pass.render(r as unknown as THREE.WebGLRenderer, 15.2, -23.7, 0.0);
    expect(r.clear).not.toHaveBeenCalled();
    expect(r.render).not.toHaveBeenCalled();

    // Active in daytime: clears RT to black, draws caustics mesh, restores renderer state
    pass.render(r as unknown as THREE.WebGLRenderer, 15.2, -23.7, 0.5);
    expect(r.clear).toHaveBeenCalledOnce();
    expect(r.render).toHaveBeenCalledOnce();
    expect(r.getRenderTarget()).toBe(prev);
    expect(r.autoClear).toBe(true);
    expect(r.getClearAlpha()).toBe(0.65);
    expect(r.getClearColor(new THREE.Color()).getHex()).toBe(0x223344);

    // Transition to night (sunUp <= 0.01): clears RT ONCE (no draw) so daytime caustics never linger
    r.clear.mockClear();
    r.render.mockClear();
    pass.render(r as unknown as THREE.WebGLRenderer, 15.2, -23.7, 0.01);
    expect(r.clear).toHaveBeenCalledOnce();
    expect(r.render).not.toHaveBeenCalled();
    expect(r.getRenderTarget()).toBe(prev);
    expect(r.autoClear).toBe(true);
    expect(r.getClearAlpha()).toBe(0.65);

    // Subsequent night frames: zero clears, zero draws
    r.clear.mockClear();
    pass.render(r as unknown as THREE.WebGLRenderer, 15.2, -23.7, 0.0);
    expect(r.clear).not.toHaveBeenCalled();
    expect(r.render).not.toHaveBeenCalled();

    // Restores renderer state even if renderer.render throws
    r.render.mockImplementationOnce(() => { throw new Error("gpu boom"); });
    expect(() => pass.render(r as unknown as THREE.WebGLRenderer, 0, 0, 0.8)).toThrow("gpu boom");
    expect(r.getRenderTarget()).toBe(prev);
    expect(r.autoClear).toBe(true);
    expect(r.getClearAlpha()).toBe(0.65);

    prev.dispose();
    pass.dispose();
  });

  it("exposes preparationEntries with a linear compilation target off-High and active RT on High, disposing all GPU resources", () => {
    const pass = new CausticsPass(makeShared());
    const entries = pass.preparationEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].root).toBe(pass.mesh);
    const compileTarget = entries[0].target();
    expect(compileTarget).not.toBeNull();
    expect([compileTarget!.width, compileTarget!.height]).toEqual([1, 1]);
    expect(compileTarget!.texture.format).toBe(THREE.RedFormat);
    expect(compileTarget!.texture.type).toBe(THREE.HalfFloatType);

    pass.setActive(true);
    const rt = pass.target!;
    expect(entries[0].target()).toBe(rt);

    const onRt = vi.fn();
    const onGeo = vi.fn();
    const onMat = vi.fn();
    const onCompileRt = vi.fn();
    rt.addEventListener("dispose", onRt);
    compileTarget!.addEventListener("dispose", onCompileRt);
    pass.mesh.geometry.addEventListener("dispose", onGeo);
    pass.mesh.material.addEventListener("dispose", onMat);

    pass.dispose();
    expect(onRt).toHaveBeenCalledOnce();
    expect(onCompileRt).toHaveBeenCalledOnce();
    expect(onGeo).toHaveBeenCalledOnce();
    expect(onMat).toHaveBeenCalledOnce();
    expect(pass.target).toBeNull();
  });
});
