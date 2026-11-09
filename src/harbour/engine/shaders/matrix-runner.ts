/** Dev-only real-driver harness, loaded explicitly by scripts/harbour/shader-matrix.mjs. */
import * as THREE from "three";
import "../../lights/lights-system"; // Same guarded Three lighting chunk as production.
import { EffectComposer } from "postprocessing";
import { assembleShader, visitShaderRecipes, type ShaderRecipe } from "../shader-recipes";
import { PostChain } from "../post";
import { TIERS } from "../quality";
import type { ShaderVerdict } from "../../../../scripts/harbour/shader-matrix-core.mjs";

/** Parse only declarations owned by the fixture; Three supplies its own built-ins and light uniforms. */
export function declarations(source: string, qualifier: "uniform" | "attribute"): { type: string; name: string; count: number | null }[] {
  const out: { type: string; name: string; count: number | null }[] = [];
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  for (const match of code.matchAll(new RegExp(`\\b${qualifier}\\s+(?:(?:lowp|mediump|highp)\\s+)?(\\w+)\\s+([^;]+);`, "g"))) {
    for (const declaration of match[2].split(",")) {
      const name = declaration.trim().match(/^(\w+)(?:\[\s*(\d+)\s*\])?$/);
      if (name) out.push({ type: match[1], name: name[1], count: name[2] === undefined ? null : Number(name[2]) });
    }
  }
  return out;
}

export function runShaderMatrix(): { rows: ShaderVerdict[]; renderer: string } {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(1, 1, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const gl = renderer.getContext(), debug = gl.getExtension("WEBGL_debug_renderer_info");
  const identity = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unknown";
  const target = new THREE.WebGLRenderTarget(1, 1);
  const tex2 = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  const tex3 = new THREE.Data3DTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, 1);
  tex3.format = THREE.RGBAFormat; tex2.needsUpdate = tex3.needsUpdate = true;
  const rows: ShaderVerdict[] = [];
  let current: ShaderVerdict | undefined;
  const compile = gl.compileShader.bind(gl), link = gl.linkProgram.bind(gl);
  gl.compileShader = (shader) => {
    compile(shader);
    const log = gl.getShaderInfoLog(shader)?.trim();
    if (log || !gl.getShaderParameter(shader, gl.COMPILE_STATUS)) current?.logs.push(`COMPILE ${log || "failed without diagnostic"}\n${gl.getShaderSource(shader)}`);
  };
  gl.linkProgram = (program) => {
    link(program);
    const log = gl.getProgramInfoLog(program)?.trim();
    if (log || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      current?.logs.push(`LINK ${log || "failed without diagnostic"}\n${(gl.getAttachedShaders(program) ?? []).map((shader) => gl.getShaderSource(shader)).join("\n")}`);
    }
  };
  renderer.debug.onShaderError = (_gl, program, vertex, fragment) => {
    current?.logs.push(`THREE shader error\n${gl.getProgramInfoLog(program)}\n${gl.getShaderInfoLog(vertex)}\n${gl.getShaderInfoLog(fragment)}\n${gl.getShaderSource(vertex)}\n${gl.getShaderSource(fragment)}`);
  };
  const uniformValue = (type: string): unknown => {
    if (type === "sampler3D") return tex3;
    if (type === "sampler2D") return tex2;
    if (type === "vec2") return new THREE.Vector2(1, 1);
    if (type === "vec3") return new THREE.Vector3(1, 1, 1);
    if (type === "vec4") return new THREE.Vector4(1, 1, 1, 1);
    if (type === "mat3") return new THREE.Matrix3();
    if (type === "mat4") return new THREE.Matrix4();
    if (type === "bool") return true;
    if (type === "float" || type === "int") return 1;
    throw new Error(`Unsupported fixture uniform type: ${type}`);
  };
  const visit = ({ id, material, geometry: mode }: ShaderRecipe) => {
    const row: ShaderVerdict = { id, logs: [], draws: 0 }; rows.push(row); current = row;
    const hook = material.onBeforeCompile;
    let mesh: THREE.Mesh | THREE.Points | undefined;
    let geometry: THREE.BufferGeometry | undefined;
    let sun: THREE.DirectionalLight | undefined;
    try {
      const source = assembleShader(material);
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute([1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0], 4));
      for (const { type, name } of declarations(source.vertexShader, "attribute")) {
        if (geometry.hasAttribute(name)) continue;
        const size = type === "float" ? 1 : Number(type.slice(-1));
        if (!Number.isInteger(size) || size < 1 || size > 4) throw new Error(`Unsupported fixture attribute: ${type} ${name}`);
        geometry.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(3 * size).fill(0.5), size));
      }
      material.onBeforeCompile = (shader, r) => {
        hook.call(material, shader, r);
        for (const { type, name, count } of declarations(shader.vertexShader + "\n" + shader.fragmentShader, "uniform")) {
          if (shader.uniforms[name]?.value != null) continue;
          shader.uniforms[name] = { value: count === null ? uniformValue(type) : Array.from({ length: count }, () => uniformValue(type)) };
        }
      };
      if (mode === "batched") {
        const batch = new THREE.BatchedMesh(1, 3, 3, material);
        const geometryId = batch.addGeometry(geometry); batch.addInstance(geometryId); mesh = batch;
        batch.perObjectFrustumCulled = false;
      } else if (mode === "instanced") {
        const instanced = new THREE.InstancedMesh(geometry, material, 1); instanced.setMatrixAt(0, new THREE.Matrix4()); mesh = instanced;
      } else mesh = id === "beam/ember" ? new THREE.Points(geometry, material) : new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false; mesh.receiveShadow = true;
      sun = new THREE.DirectionalLight(0xffffff, 1); sun.castShadow = true; sun.shadow.mapSize.set(1, 1);
      const scene = new THREE.Scene(); scene.add(mesh, new THREE.AmbientLight(0xffffff, 0.5), sun);
      // Exercise the guarded point-light chunk as in production (slots remain even at zero intensity).
      if (material instanceof THREE.MeshStandardMaterial) for (let i = 0; i < 16; i++) scene.add(new THREE.PointLight(0xffffff, i === 0 ? 1 : 0));
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100); camera.position.z = 3; camera.updateMatrixWorld();
      renderer.setRenderTarget(target); renderer.compile(scene, camera); renderer.info.reset(); renderer.render(scene, camera);
      row.draws = renderer.info.render.calls;
      // Force completion and catch draw-time errors (including incompatible sampler/attribute bindings).
      const pixel = new Uint8Array(4); renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
      for (let error = gl.getError(); error !== gl.NO_ERROR; error = gl.getError()) row.logs.push(`GL error 0x${error.toString(16)}`);
    } catch (error) { row.logs.push(error instanceof Error ? error.stack ?? error.message : String(error)); }
    finally {
      material.onBeforeCompile = hook;
      if (mesh instanceof THREE.BatchedMesh) mesh.dispose();
      geometry?.dispose(); sun?.shadow.dispose();
      current = undefined;
    }
  };
  let composer: EffectComposer | undefined;
  try {
    visitShaderRecipes(visit);
    // Also exercise dependency-owned bloom, tilt, merged grading and SMAA private programs, at actual tier presets.
    composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    const chain = new PostChain(renderer, composer, new THREE.Scene(), new THREE.PerspectiveCamera());
    for (const tier of ["high", "medium", "low"] as const) {
      chain.setQuality(TIERS[tier]);
      const batch = chain.preparationEntries(tier === "high" ? undefined : TIERS[tier]);
      try {
        batch.entries.forEach((entry, i) => entry.root.traverse((object) => {
          const material = (object as THREE.Mesh).material;
          if (material) for (const mat of Array.isArray(material) ? material : [material]) visit({ id: `post/${tier}/${i}/${mat.name || mat.type}`, material: mat, geometry: "static" });
        }));
      } finally { batch.dispose(); }
    }
    chain.dispose();
    return { rows, renderer: identity };
  } finally {
    gl.compileShader = compile; gl.linkProgram = link;
    composer?.dispose(); target.dispose(); tex2.dispose(); tex3.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
}
