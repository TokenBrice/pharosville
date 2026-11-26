import * as THREE from "three";
import type { QualityTier } from "../../engine/quality";
import type { PreparationEntry } from "../../engine/types";
import { SWELL_DIR } from "../waves";
import { FFT_BFLY_FRAG } from "./butterfly";
import { CPU_FFT_N, CpuFftMirror } from "./cpu-mirror";
import { FFT_PACK_DISP_FRAG, FFT_PACK_SLOPE_FRAG } from "./pack";
import {
  FFT_CASCADE_BANDS,
  FFT_CASCADE_SEEDS,
  FFT_FULLSCREEN_VERT,
  FFT_H0_FRAG,
  FFT_PATCH_SIZES,
  FFT_SPEC_FRAG,
  FFT_TIME_LOOP_S,
  FFT_W0_K,
} from "./spectrum";

export {
  CPU_FFT_N,
  CpuFftMirror,
  FFT_BFLY_FRAG,
  FFT_CASCADE_BANDS,
  FFT_CASCADE_SEEDS,
  FFT_FULLSCREEN_VERT,
  FFT_H0_FRAG,
  FFT_PACK_DISP_FRAG,
  FFT_PACK_SLOPE_FRAG,
  FFT_PATCH_SIZES,
  FFT_SPEC_FRAG,
  FFT_W0_K,
};

export interface FftUniforms {
  uFftAtlas: THREE.IUniform<THREE.DataArrayTexture>;
  uFftOn: THREE.IUniform<number>;
  /** (1/509, 1/97, 1/17.3, chop) */
  uFftScales: THREE.IUniform<THREE.Vector4>;
  /** (w0, w1, w2, swellBlend) */
  uFftWeights: THREE.IUniform<THREE.Vector4>;
}

interface TextureProps {
  __webglTexture?: WebGLTexture;
}

const CASCADE_COUNT = 3;
const ATLAS_LAYERS = 6;

function createFallbackAtlas(): THREE.DataArrayTexture {
  // 1×1×6 RGBA8: layers 0..2 carry (dx=0, dy=0, dz=0, J_det=1); layers 3..5 carry (0, 0, 0, 0).
  const data = new Uint8Array(ATLAS_LAYERS * 4);
  for (let l = 0; l < CASCADE_COUNT; l++) {
    data[l * 4 + 3] = 255;
  }
  const tex = new THREE.DataArrayTexture(data, 1, 1, ATLAS_LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.name = "FftWaveSystem.Fallback";
  tex.needsUpdate = true;
  return tex;
}

function createFullscreenTri(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return geo;
}

function createSingleTarget(size: number, type: THREE.TextureDataType, name: string): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    generateMipmaps: false,
  });
  rt.texture.name = name;
  return rt;
}

function createMrtTarget(size: number, type: THREE.TextureDataType, name: string): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    count: 2,
    type,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    generateMipmaps: false,
  });
  if (rt.textures[0]) rt.textures[0].name = `${name}.0`;
  if (rt.textures[1]) rt.textures[1].name = `${name}.1`;
  return rt;
}

/**
 * 3-cascade WebGL2 fragment FFT wave engine + 64² CPU C0 buoyancy mirror (Phase 2 Workstream A, §5.1).
 *
 * - High tier (`N = 256`): updates all 3 cascades (`C0 = 509 m`, `C1 = 97 m`, `C2 = 17.3 m`) each frame.
 * - Medium tier (`N = 128`): updates `C0` every frame and alternates `C1` / `C2` on even / odd frames
 *   (all 3 update immediately on allocation, resize, or wind dirtying so no layer is ever stale).
 * - Low tier: disposes all GPU render targets immediately (0 MB VRAM), restores the 1×1×6 zero
 *   `DataArrayTexture` fallback, sets `uFftOn = 0`, and disables the CPU buoyancy mirror.
 *
 * Probing `EXT_color_buffer_float` once on the first GPU update automatically selects `RGBA32F`
 * (`FloatType`) when supported and falls back cleanly to `RGBA16F` (`HalfFloatType`) otherwise.
 * Packing keeps `atlas.texture.generateMipmaps = false` during per-layer writes and invokes ONE
 * manual `gl.generateMipmap(gl.TEXTURE_2D_ARRAY)` after all updated layers finish (M9).
 */
export class FftWaveSystem {
  readonly uniforms: FftUniforms;
  readonly cpuMirror = new CpuFftMirror();

  private currentTier: QualityTier = "low";
  private currentSize = 0;
  private c2Size = 0;
  private log2Size = 0;
  private c2Log2 = 0;
  private floatProbed = false;
  private workTexType: THREE.TextureDataType = THREE.FloatType;
  private disposed = false;

  private readonly fallback: THREE.DataArrayTexture;
  private readonly dummyTex2D: THREE.DataTexture;
  private readonly compileSingleRT: THREE.WebGLRenderTarget;
  private readonly compileMrtRT: THREE.WebGLRenderTarget;

  private h0Targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null;
  private pingRT: THREE.WebGLRenderTarget | null = null;
  private pongRT: THREE.WebGLRenderTarget | null = null;
  private c2PingRT: THREE.WebGLRenderTarget | null = null;
  private c2PongRT: THREE.WebGLRenderTarget | null = null;
  private atlasRT: THREE.WebGLArrayRenderTarget | null = null;

  private readonly quadGeo: THREE.BufferGeometry;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private readonly h0Mat: THREE.ShaderMaterial;
  private readonly specMat: THREE.ShaderMaterial;
  private readonly bflyMat: THREE.ShaderMaterial;
  private readonly packDispMat: THREE.ShaderMaterial;
  private readonly packSlopeMat: THREE.ShaderMaterial;

  private readonly h0Scene = new THREE.Scene();
  private readonly specScene = new THREE.Scene();
  private readonly bflyScene = new THREE.Scene();
  private readonly packDispScene = new THREE.Scene();
  private readonly packSlopeScene = new THREE.Scene();

  private readonly h0Mesh: THREE.Mesh;
  private readonly specMesh: THREE.Mesh;
  private readonly bflyMesh: THREE.Mesh;
  private readonly packDispMesh: THREE.Mesh;
  private readonly packSlopeMesh: THREE.Mesh;

  private h0Dirty = true;
  private allCascadesDirty = true;
  private lastWindSpeed = NaN;
  private lastWindDirX = NaN;
  private lastWindDirZ = NaN;
  private frameCounter = 0;
  private bakes = 0;
  private readonly lastUpdated: number[] = [];

  constructor() {
    this.fallback = createFallbackAtlas();

    this.uniforms = {
      uFftAtlas: { value: this.fallback },
      uFftOn: { value: 0 },
      uFftScales: {
        value: new THREE.Vector4(1 / FFT_PATCH_SIZES[0], 1 / FFT_PATCH_SIZES[1], 1 / FFT_PATCH_SIZES[2], 0.55),
      },
      uFftWeights: { value: new THREE.Vector4(1, 1, 1, 1) },
    };

    // Tiny 1×1 compilation targets so tier transitions compile all 4 FFT shaders without stalling
    this.compileSingleRT = createSingleTarget(1, THREE.HalfFloatType, "FftWaveSystem.CompileSingle");
    this.compileMrtRT = createMrtTarget(1, THREE.HalfFloatType, "FftWaveSystem.CompileMrt");

    this.quadGeo = createFullscreenTri();

    this.dummyTex2D = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
    this.dummyTex2D.needsUpdate = true;
    const dummyTex = this.dummyTex2D;

    this.h0Mat = new THREE.ShaderMaterial({
      name: "hb_fft_h0",
      glslVersion: THREE.GLSL3,
      vertexShader: FFT_FULLSCREEN_VERT,
      fragmentShader: FFT_H0_FRAG,
      uniforms: {
        uSize: { value: 256 },
        uPatchSize: { value: FFT_PATCH_SIZES[0] },
        uWindSpeed: { value: 10 },
        uWindDir: { value: new THREE.Vector2(SWELL_DIR[0], SWELL_DIR[1]) },
        uBandK: { value: new THREE.Vector2(FFT_CASCADE_BANDS[0][0], FFT_CASCADE_BANDS[0][1]) },
        uNotchStrength: { value: 1 },
        uSeed: { value: FFT_CASCADE_SEEDS[0] },
      },
      depthTest: false,
      depthWrite: false,
      fog: false,
    });

    this.specMat = new THREE.ShaderMaterial({
      name: "hb_fft_spec",
      glslVersion: THREE.GLSL3,
      vertexShader: FFT_FULLSCREEN_VERT,
      fragmentShader: FFT_SPEC_FRAG,
      uniforms: {
        uH0Tex: { value: dummyTex },
        uSize: { value: 256 },
        uPatchSize: { value: FFT_PATCH_SIZES[0] },
        uTime: { value: 0 },
        uSeaAmp: { value: 0.24 },
      },
      depthTest: false,
      depthWrite: false,
      fog: false,
    });

    this.bflyMat = new THREE.ShaderMaterial({
      name: "hb_fft_bfly",
      glslVersion: THREE.GLSL3,
      vertexShader: FFT_FULLSCREEN_VERT,
      fragmentShader: FFT_BFLY_FRAG,
      uniforms: {
        uSrc0: { value: dummyTex },
        uSrc1: { value: dummyTex },
        uSize: { value: 256 },
        uStage: { value: 0 },
        uAxis: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      fog: false,
    });

    this.packDispMat = new THREE.ShaderMaterial({
      name: "hb_fft_pack",
      glslVersion: THREE.GLSL3,
      vertexShader: FFT_FULLSCREEN_VERT,
      fragmentShader: FFT_PACK_DISP_FRAG,
      uniforms: {
        uField0: { value: dummyTex },
        uField1: { value: dummyTex },
        uChop: { value: 0.55 },
        uAtlasSize: { value: 256 },
      },
      depthTest: false,
      depthWrite: false,
      fog: false,
    });

    this.packSlopeMat = new THREE.ShaderMaterial({
      name: "hb_fft_pack",
      glslVersion: THREE.GLSL3,
      vertexShader: FFT_FULLSCREEN_VERT,
      fragmentShader: FFT_PACK_SLOPE_FRAG,
      uniforms: {
        uField0: { value: dummyTex },
        uField1: { value: dummyTex },
        uAtlasSize: { value: 256 },
      },
      depthTest: false,
      depthWrite: false,
      fog: false,
    });

    this.h0Mesh = new THREE.Mesh(this.quadGeo, this.h0Mat);
    this.specMesh = new THREE.Mesh(this.quadGeo, this.specMat);
    this.bflyMesh = new THREE.Mesh(this.quadGeo, this.bflyMat);
    this.packDispMesh = new THREE.Mesh(this.quadGeo, this.packDispMat);
    this.packSlopeMesh = new THREE.Mesh(this.quadGeo, this.packSlopeMat);

    this.h0Mesh.frustumCulled = false;
    this.specMesh.frustumCulled = false;
    this.bflyMesh.frustumCulled = false;
    this.packDispMesh.frustumCulled = false;
    this.packSlopeMesh.frustumCulled = false;

    this.h0Scene.add(this.h0Mesh);
    this.specScene.add(this.specMesh);
    this.bflyScene.add(this.bflyMesh);
    this.packDispScene.add(this.packDispMesh);
    this.packSlopeScene.add(this.packSlopeMesh);
  }

  get tier(): QualityTier {
    return this.currentTier;
  }

  get resolution(): number {
    return this.currentSize;
  }

  get c2Resolution(): number {
    return this.c2Size;
  }

  get workType(): THREE.TextureDataType {
    return this.workTexType;
  }

  get atlasTarget(): THREE.WebGLArrayRenderTarget | null {
    return this.atlasRT;
  }

  get workTargets(): {
    h0: readonly THREE.WebGLRenderTarget[] | null;
    ping: THREE.WebGLRenderTarget | null;
    pong: THREE.WebGLRenderTarget | null;
  } {
    return { h0: this.h0Targets, ping: this.pingRT, pong: this.pongRT };
  }

  /** Number of times `h0` spectra have been baked (diagnostic/test counter). */
  get h0BakeCount(): number {
    return this.bakes;
  }

  /** Cascade indices updated on the most recent `update()` call (diagnostic/test helper). */
  get lastCascadesUpdated(): readonly number[] {
    return this.lastUpdated;
  }

  private allocateWorkTargets(size: number): void {
    this.disposeWorkTargets();
    const t = this.workTexType;
    const c2N = Math.min(size, 128);
    this.c2Size = c2N;
    this.c2Log2 = Math.round(Math.log2(c2N));
    this.h0Targets = [
      createSingleTarget(size, t, "FftWaveSystem.H0.C0"),
      createSingleTarget(size, t, "FftWaveSystem.H0.C1"),
      createSingleTarget(c2N, t, "FftWaveSystem.H0.C2"),
    ];
    this.pingRT = createMrtTarget(size, t, "FftWaveSystem.Ping");
    this.pongRT = createMrtTarget(size, t, "FftWaveSystem.Pong");
    if (c2N !== size) {
      this.c2PingRT = createMrtTarget(c2N, t, "FftWaveSystem.C2Ping");
      this.c2PongRT = createMrtTarget(c2N, t, "FftWaveSystem.C2Pong");
    }
    this.h0Dirty = true;
    this.allCascadesDirty = true;
  }

  private allocateAllTargets(size: number): void {
    this.allocateWorkTargets(size);
    if (this.atlasRT) {
      this.uniforms.uFftAtlas.value = this.fallback;
      this.atlasRT.dispose();
      this.atlasRT = null;
    }
    const atlas = new THREE.WebGLArrayRenderTarget(size, size, ATLAS_LAYERS, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      generateMipmaps: false,
    });
    atlas.texture.name = "FftWaveSystem.Atlas";
    this.atlasRT = atlas;
    this.currentSize = size;
    this.log2Size = Math.round(Math.log2(size));
    this.uniforms.uFftAtlas.value = atlas.texture;
  }

  private disposeWorkTargets(): void {
    const dummy = this.dummyTex2D;
    this.specMat.uniforms.uH0Tex.value = dummy;
    this.bflyMat.uniforms.uSrc0.value = dummy;
    this.bflyMat.uniforms.uSrc1.value = dummy;
    this.packDispMat.uniforms.uField0.value = dummy;
    this.packDispMat.uniforms.uField1.value = dummy;
    this.packSlopeMat.uniforms.uField0.value = dummy;
    this.packSlopeMat.uniforms.uField1.value = dummy;

    if (this.h0Targets) {
      for (const rt of this.h0Targets) rt.dispose();
      this.h0Targets = null;
    }
    if (this.pingRT) {
      this.pingRT.dispose();
      this.pingRT = null;
    }
    if (this.pongRT) {
      this.pongRT.dispose();
      this.pongRT = null;
    }
    if (this.c2PingRT) {
      this.c2PingRT.dispose();
      this.c2PingRT = null;
    }
    if (this.c2PongRT) {
      this.c2PongRT.dispose();
      this.c2PongRT = null;
    }
    this.c2Size = 0;
    this.c2Log2 = 0;
  }

  private disposeAllTargets(): void {
    // Always restore the 1×1×6 fallback texture BEFORE disposing the live atlas RT.
    this.uniforms.uFftAtlas.value = this.fallback;
    this.uniforms.uFftOn.value = 0;
    this.disposeWorkTargets();
    if (this.atlasRT) {
      this.atlasRT.dispose();
      this.atlasRT = null;
    }
    this.currentSize = 0;
    this.log2Size = 0;
    this.h0Dirty = true;
    this.allCascadesDirty = true;
  }

  setTier(tier: QualityTier): void {
    if (this.disposed) return;
    if (tier === this.currentTier && (tier === "low" || this.atlasRT !== null)) return;
    this.currentTier = tier;

    if (tier === "low") {
      this.disposeAllTargets();
      this.cpuMirror.setActive(false);
      this.lastUpdated.length = 0;
      return;
    }

    const wantSize = tier === "high" ? 256 : 128;
    if (this.currentSize !== wantSize || !this.atlasRT || !this.h0Targets || !this.pingRT || !this.pongRT) {
      this.allocateAllTargets(wantSize);
    } else {
      this.uniforms.uFftAtlas.value = this.atlasRT.texture;
      this.allCascadesDirty = true;
    }
    this.uniforms.uFftOn.value = 1;
    this.cpuMirror.setGpuResolution(wantSize);
    this.cpuMirror.setActive(true);
    this.frameCounter = 0;
  }

  private probeFloatSupport(renderer: THREE.WebGLRenderer): void {
    if (this.floatProbed) return;
    this.floatProbed = true;
    const gl = renderer.getContext?.() as WebGL2RenderingContext | undefined;
    const hasFloat = gl && typeof gl.getExtension === "function" ? gl.getExtension("EXT_color_buffer_float") : null;
    const nextType: THREE.TextureDataType = hasFloat ? THREE.FloatType : THREE.HalfFloatType;
    if (!hasFloat && gl && typeof gl.getExtension === "function") {
      gl.getExtension("EXT_color_buffer_half_float");
    }
    if (nextType !== this.workTexType) {
      this.workTexType = nextType;
      if (this.currentSize > 0) {
        this.allocateWorkTargets(this.currentSize);
      }
    }
  }

  update(
    renderer: THREE.WebGLRenderer,
    time: number,
    windSpeed: number,
    windDirX: number,
    windDirZ: number,
    seaAmp: number,
    chop: number,
  ): void {
    this.uniforms.uFftScales.value.w = chop;
    if (this.disposed || this.currentTier === "low") {
      this.lastUpdated.length = 0;
      return;
    }

    this.probeFloatSupport(renderer);

    const h0Targets = this.h0Targets;
    const pingRT = this.pingRT;
    const pongRT = this.pongRT;
    const atlasRT = this.atlasRT;
    if (!h0Targets || !pingRT || !pongRT || !atlasRT) return;

    const dirLen = Math.hypot(windDirX, windDirZ);
    const wx = dirLen > 1e-5 ? windDirX / dirLen : SWELL_DIR[0];
    const wz = dirLen > 1e-5 ? windDirZ / dirLen : SWELL_DIR[1];

    const windChanged =
      !Number.isFinite(this.lastWindSpeed) ||
      Math.abs(windSpeed - this.lastWindSpeed) > 0.05 ||
      wx * this.lastWindDirX + wz * this.lastWindDirZ < 0.9998;
    if (windChanged) {
      this.h0Dirty = true;
      this.allCascadesDirty = true;
    }

    const doBakeH0 = this.h0Dirty;
    const updateAll = doBakeH0 || this.allCascadesDirty || this.currentTier === "high";

    this.lastUpdated.length = 0;
    if (updateAll) {
      this.lastUpdated.push(0, 1, 2);
    } else {
      // Medium stagger: C0 every frame, alternate C1 (even) and C2 (odd)
      this.lastUpdated.push(0, (this.frameCounter & 1) === 0 ? 1 : 2);
    }

    const prevTarget = renderer.getRenderTarget();
    const prevCubeFace = renderer.getActiveCubeFace();
    const prevMipLevel = renderer.getActiveMipmapLevel();
    const prevAutoClear = renderer.autoClear;

    try {
      renderer.autoClear = false;
      const N = this.currentSize;
      const tWrap = ((time % FFT_TIME_LOOP_S) + FFT_TIME_LOOP_S) % FFT_TIME_LOOP_S;

      if (doBakeH0) {
        this.h0Mat.uniforms.uWindSpeed.value = windSpeed;
        (this.h0Mat.uniforms.uWindDir.value as THREE.Vector2).set(wx, wz);
        for (let c = 0; c < CASCADE_COUNT; c++) {
          const [bLo, bHi] = FFT_CASCADE_BANDS[c];
          const cN = c === 2 ? this.c2Size : N;
          this.h0Mat.uniforms.uSize.value = cN;
          this.h0Mat.uniforms.uPatchSize.value = FFT_PATCH_SIZES[c];
          (this.h0Mat.uniforms.uBandK.value as THREE.Vector2).set(bLo, bHi);
          this.h0Mat.uniforms.uNotchStrength.value = c === 0 ? 1.0 : 0.0;
          this.h0Mat.uniforms.uSeed.value = FFT_CASCADE_SEEDS[c];
          renderer.setRenderTarget(h0Targets[c]);
          renderer.render(this.h0Scene, this.cam);
        }
        this.lastWindSpeed = windSpeed;
        this.lastWindDirX = wx;
        this.lastWindDirZ = wz;
        this.h0Dirty = false;
        this.bakes++;
      }

      this.specMat.uniforms.uTime.value = tWrap;
      this.specMat.uniforms.uSeaAmp.value = seaAmp;
      this.packDispMat.uniforms.uChop.value = chop;
      this.packDispMat.uniforms.uAtlasSize.value = N;
      this.packSlopeMat.uniforms.uAtlasSize.value = N;

      for (let idx = 0; idx < this.lastUpdated.length; idx++) {
        const c = this.lastUpdated[idx];
        const useC2 = c === 2 && this.c2PingRT !== null && this.c2PongRT !== null;
        const cN = useC2 ? this.c2Size : N;
        const stages = useC2 ? this.c2Log2 : this.log2Size;
        const cPing = useC2 ? this.c2PingRT! : pingRT;
        const cPong = useC2 ? this.c2PongRT! : pongRT;

        // 1. Time evolution + 8-field spectral packing into cPing (2× MRT)
        this.specMat.uniforms.uSize.value = cN;
        this.specMat.uniforms.uH0Tex.value = h0Targets[c].texture;
        this.specMat.uniforms.uPatchSize.value = FFT_PATCH_SIZES[c];
        renderer.setRenderTarget(cPing);
        renderer.render(this.specScene, this.cam);

        // 2. Stockham radix-2 auto-sorting 2D IFFT (horizontal then vertical)
        this.bflyMat.uniforms.uSize.value = cN;
        let srcRT = cPing;
        let dstRT = cPong;
        for (let axis = 0; axis < 2; axis++) {
          this.bflyMat.uniforms.uAxis.value = axis;
          for (let s = 0; s < stages; s++) {
            this.bflyMat.uniforms.uStage.value = s;
            this.bflyMat.uniforms.uSrc0.value = srcRT.textures[0];
            this.bflyMat.uniforms.uSrc1.value = srcRT.textures[1];
            renderer.setRenderTarget(dstRT);
            renderer.render(this.bflyScene, this.cam);
            const tmp = srcRT;
            srcRT = dstRT;
            dstRT = tmp;
          }
        }

        // 3. Pack displacement + Jacobian determinant into atlas layer c (0..2)
        this.packDispMat.uniforms.uField0.value = srcRT.textures[0];
        this.packDispMat.uniforms.uField1.value = srcRT.textures[1];
        renderer.setRenderTarget(atlasRT, c);
        renderer.render(this.packDispScene, this.cam);

        // 4. Pack slope + convergence + slopeVar into atlas layer c + 3 (3..5)
        this.packSlopeMat.uniforms.uField0.value = srcRT.textures[0];
        this.packSlopeMat.uniforms.uField1.value = srcRT.textures[1];
        renderer.setRenderTarget(atlasRT, c + CASCADE_COUNT);
        renderer.render(this.packSlopeScene, this.cam);
      }

      // Single manual mipmap generation for all 6 array layers after writes finish (M9)
      const gl = renderer.getContext?.() as WebGL2RenderingContext | undefined;
      const texProps = renderer.properties?.get(atlasRT.texture) as TextureProps | undefined;
      if (gl && texProps?.__webglTexture) {
        renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, texProps.__webglTexture);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        renderer.state.unbindTexture();
      }

      this.allCascadesDirty = false;
      this.frameCounter++;
    } finally {
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget, prevCubeFace, prevMipLevel);
    }

    // Keep 64² CPU C0 buoyancy mirror synchronized with GPU C0
    this.cpuMirror.update(time, windSpeed, wx, wz, seaAmp, chop);
  }

  /** CPU C0 FFT wave height (m) at world `(x, z)` (returns 0 on Low tier). */
  heightAt(x: number, z: number): number {
    return this.currentTier === "low" ? 0 : this.cpuMirror.heightAt(x, z);
  }

  /** CPU C0 FFT raw `(dx, dy, dz)` displacement (m) at undisplaced world `(x, z)` (zero-alloc). */
  sampleRawDisplacement(x: number, z: number, out: [number, number, number]): [number, number, number] {
    if (this.currentTier === "low") { out[0] = 0; out[1] = 0; out[2] = 0; return out; }
    return this.cpuMirror.sampleRawDisplacement(x, z, out);
  }

  /** Pre-compilation entries for all FFT passes using tiny 1×1 targets (stall-free tier switches). */
  preparationEntries(): PreparationEntry[] {
    return [
      { root: this.h0Mesh, camera: this.cam, target: () => this.h0Targets?.[0] ?? this.compileSingleRT, scene: this.h0Scene },
      { root: this.specMesh, camera: this.cam, target: () => this.pingRT ?? this.compileMrtRT, scene: this.specScene },
      { root: this.bflyMesh, camera: this.cam, target: () => this.pongRT ?? this.compileMrtRT, scene: this.bflyScene },
      { root: this.packDispMesh, camera: this.cam, target: () => this.compileSingleRT, scene: this.packDispScene },
      { root: this.packSlopeMesh, camera: this.cam, target: () => this.compileSingleRT, scene: this.packSlopeScene },
    ];
  }

  dispose(): void {
    if (this.disposed) return;
    this.setTier("low");
    this.disposed = true;
    this.fallback.dispose();
    this.dummyTex2D.dispose();
    this.compileSingleRT.dispose();
    this.compileMrtRT.dispose();
    this.quadGeo.dispose();
    this.h0Mat.dispose();
    this.specMat.dispose();
    this.bflyMat.dispose();
    this.packDispMat.dispose();
    this.packSlopeMat.dispose();
  }
}
