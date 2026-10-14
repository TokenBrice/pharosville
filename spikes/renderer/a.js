// Scene A: WebGLRenderer + GLSL (onBeforeCompile / ShaderMaterial) + pmndrs postprocessing.
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import * as W from './world.js';
import { makeStats, makeGLTimer } from './stats.js';

const T0 = performance.now();
let G = 'misc';
const P = W.params();
const ST = makeStats('A webgl+glsl+pmndrs');
ST.mark('moduleStart', T0);

const world = W.buildWorld(THREE);
ST.mark('worldGenMs', world.genMs);
const tod = W.TOD[P.tod] ?? W.TOD.night;
const sun = W.sunDir(tod);

// ------------------------------------------------------------------ renderer
G = 'renderer';
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, depth: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
ST.S.backend = 'webgl2';
const gl = renderer.getContext();
const timer = makeGLTimer(gl, (ms) => ST.gpu(ms));
ST.mark('rendererInit');

const OFF = new Set((new URLSearchParams(location.search).get('off') ?? '').split(',').filter(Boolean));
const scene = new THREE.Scene();
{ const add = scene.add.bind(scene); scene.add = (...o) => { o.forEach((x) => { x.userData.g = G; }); return add(...o); }; }
const camera = new THREE.PerspectiveCamera(25, innerWidth / innerHeight, 5, 9000);
const pose = W.camPose(P.cam);
camera.position.set(...pose.pos); camera.lookAt(...pose.target);
scene.fog = new THREE.FogExp2(new THREE.Color(tod.haze), 0.00012);
scene.background = new THREE.Color(tod.haze);

// ------------------------------------------------------------------ shared uniforms
G = 'shared';
const U = {
  uTime: { value: 0 },
  uNight: { value: tod.night },
  uSunDir: { value: new THREE.Vector3(...sun) },
  uSunColor: { value: new THREE.Color(tod.sun).multiplyScalar(tod.sunI) },
  uZenith: { value: new THREE.Color(tod.zenith) },
  uHorizon: { value: new THREE.Color(tod.horizon) },
  uHaze: { value: new THREE.Color(tod.haze) },
  uBeamAngle: { value: 0 },
  uBeamPos: { value: new THREE.Vector3(...world.lighthouse.lantern) },
  uHazeAnchor: { value: new THREE.Vector2(pose.target[0], pose.target[2]) },
  uHazeDir: { value: new THREE.Vector2(pose.target[0] - pose.pos[0], pose.target[2] - pose.pos[2]).normalize() },
};

function dataTex(data, n, type = THREE.HalfFloatType) {
  let arr = data;
  if (type === THREE.HalfFloatType) { arr = new Uint16Array(data.length); for (let i = 0; i < data.length; i++) arr[i] = THREE.DataUtils.toHalfFloat(data[i]); }
  const t = new THREE.DataTexture(arr, n, n, THREE.RedFormat, type);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}
const shoreTex = dataTex(world.shore.data, world.shore.n);
const contactTex = dataTex(world.contact.data, world.contact.n);
const rgbaTex = (o, srgb = false) => { const t = new THREE.DataTexture(o.data, o.size, o.size, THREE.RGBAFormat, THREE.UnsignedByteType); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
const normalTex = rgbaTex(world.normal);
const noiseTex = rgbaTex(world.noise);
const atlasTex = new THREE.CanvasTexture(world.atlas); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 8; atlasTex.generateMipmaps = true; atlasTex.minFilter = THREE.LinearMipmapLinearFilter;

// ------------------------------------------------------------------ GLSL library
const WAVE_GLSL = (() => {
  let disp = '', nrm = '';
  for (const [dx, dz, L, A, steep] of W.WAVES) {
    const len = Math.hypot(dx, dz), x = (dx / len).toFixed(5), z = (dz / len).toFixed(5), k = (2 * Math.PI / L), w = Math.sqrt(9.81 * k) * 0.8, Q = steep / (k * A * W.WAVES.length);
    const f = `(${k.toFixed(5)} * dot(vec2(${x}, ${z}), p) - ${w.toFixed(5)} * t)`;
    disp += `  { float f = ${f}; float c = cos(f), s = sin(f); d.x += ${(Q * A).toFixed(5)} * ${x} * c * amp; d.z += ${(Q * A).toFixed(5)} * ${z} * c * amp; d.y += ${A.toFixed(5)} * s * amp; }\n`;
    nrm += `  { float f = ${f}; float c = cos(f), s = sin(f); float wa = ${(k * A).toFixed(5)} * amp; n.x -= ${x} * wa * c; n.z -= ${z} * wa * c; n.y -= ${(Q * k * A).toFixed(5)} * s * amp; }\n`;
  }
  return `
vec3 gerstnerDisp(vec2 p, float t, float amp) { vec3 d = vec3(0.0);\n${disp}  return d; }
vec3 gerstnerNormal(vec2 p, float t, float amp) { vec3 n = vec3(0.0, 1.0, 0.0);\n${nrm}  return normalize(n); }
`;
})();
const SKY_GLSL = `
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHaze; uniform float uNight;
vec3 skyColor(vec3 d) {
  float h = d.y;
  vec3 c = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  c = mix(c, uHaze, smoothstep(0.02, -0.15, h));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunColor * (pow(sd, 6.0) * 0.10 + pow(sd, 48.0) * 0.25) * (1.0 - 0.6 * uNight);
  return c;
}`;
const COMMON_GLSL = `
uniform float uTime;
${WAVE_GLSL}
${SKY_GLSL}
`;

// ------------------------------------------------------------------ sky dome
G = 'sky';
{
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U, uNoise: { value: noiseTex } }, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `${COMMON_GLSL}
      uniform sampler2D uNoise; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); vec3 c = skyColor(d);
        float sd = dot(d, uSunDir); c += uSunColor * smoothstep(0.9993, 0.9997, sd) * 4.0;
        vec2 sp = d.xz / max(d.y + 0.25, 0.05) * 6.0; float st = texture(uNoise, sp).r * texture(uNoise, sp * 3.7).g;
        c += vec3(0.9, 0.95, 1.0) * smoothstep(0.42, 0.5, st) * smoothstep(0.05, 0.3, d.y) * uNight * 2.5;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), m); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
}

// ------------------------------------------------------------------ lights
G = 'lights';
const sunLight = new THREE.DirectionalLight(new THREE.Color(tod.sun), tod.sunI);
sunLight.position.set(sun[0] * 900 + pose.target[0], sun[1] * 900, sun[2] * 900 + pose.target[2]);
sunLight.target.position.set(pose.target[0], 0, pose.target[2]);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
Object.assign(sunLight.shadow.camera, { left: -620, right: 620, top: 620, bottom: -620, near: 10, far: 2400 });
sunLight.shadow.bias = -0.0003; sunLight.shadow.normalBias = 0.5; sunLight.shadow.radius = 2.5;
scene.add(sunLight, sunLight.target);
scene.add(new THREE.HemisphereLight(new THREE.Color(tod.hemiSky), new THREE.Color(tod.hemiGround), tod.hemiI));

// ------------------------------------------------------------------ terrain
G = 'terrain';
const terrain = new THREE.Mesh(world.terrain.geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
terrain.castShadow = terrain.receiveShadow = true; scene.add(terrain);

// ------------------------------------------------------------------ ocean
G = 'ocean';
function oceanGeometry() {
  const N = 180, P = [], I = [];
  const map = (u) => { const a = Math.abs(u), s = Math.sign(u); return a <= 0.85 ? u / 0.85 * 640 : s * (640 + ((a - 0.85) / 0.15) ** 2 * 5400); };
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) P.push(map(-1 + 2 * i / N), 0, map(-1 + 2 * j / N));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(P.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  return g;
}
const wakeRT = [0, 1].map(() => new THREE.WebGLRenderTarget(2048, 2048, { type: THREE.HalfFloatType, format: THREE.RGFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
const OU = {
  uShore: { value: shoreTex }, uContact: { value: contactTex }, uWake: { value: wakeRT[0].texture }, uNormal: { value: normalTex }, uNoise: { value: noiseTex },
  uContactCenter: { value: new THREE.Vector2(...world.contact.center) }, uContactSize: { value: world.contact.size },
};
const oceanMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0 });
oceanMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U, OU);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${COMMON_GLSL}\nuniform sampler2D uShore; varying vec2 vXZ; varying float vDamp;`)
    .replace('#include <begin_vertex>', `
      vec3 transformed = position;
      vXZ = position.xz;
      float sdv = texture2D(uShore, position.xz / ${W.SEA.toFixed(1)} + 0.5).r;
      vDamp = smoothstep(1.0, 28.0, sdv) * (1.0 - smoothstep(520.0, 640.0, max(abs(position.x), abs(position.z))));
      transformed += gerstnerDisp(position.xz, uTime, vDamp);`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\n${COMMON_GLSL}
      uniform sampler2D uShore, uContact, uWake, uNormal, uNoise; uniform vec2 uContactCenter; uniform float uContactSize;
      uniform float uBeamAngle; uniform vec3 uBeamPos; uniform vec2 uHazeAnchor, uHazeDir;
      varying vec2 vXZ; varying float vDamp;`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 xz = vXZ;
      float sd = texture2D(uShore, xz / ${W.SEA.toFixed(1)} + 0.5).r;
      float outside = step(${(W.SEA / 2).toFixed(1)}, max(abs(xz.x), abs(xz.y)));
      sd = mix(sd, 400.0, outside);
      float dc = texture2D(uContact, (xz - uContactCenter) / uContactSize + 0.5).r;
      vec2 wk = texture2D(uWake, xz / ${W.SEA.toFixed(1)} + 0.5).rg * (1.0 - outside); float wake = wk.r;
      vec4 nC = texture2D(uNoise, xz * 0.17 + vec2(uTime * 0.02, 0.0));
      vec4 nA = texture2D(uNoise, xz * 0.0035);
      vec4 nB = texture2D(uNoise, xz * 0.021 + vec2(uTime * 0.004, -uTime * 0.003));
      // wind slicks: large calm/rippled patches drifting slowly
      float slick = smoothstep(0.30, 0.72, texture2D(uNoise, xz * 0.0013 + vec2(uTime * 0.0011, uTime * 0.0004)).g);
      float rip = mix(0.35, 1.0, slick);
      // --- normals: gerstner swell + two scrolling detail layers
      float camD = length(cameraPosition.xz - xz);
      vec3 gN = gerstnerNormal(xz, uTime, max(vDamp, 0.35) * 0.4 * mix(1.0, 0.25, smoothstep(500.0, 1500.0, camD)));
      vec4 t1 = texture2D(uNormal, xz * 0.031 + vec2(uTime * 0.012, uTime * 0.007));
      vec2 xr = mat2(0.825, 0.565, -0.565, 0.825) * xz;
      vec4 t2 = texture2D(uNormal, xr * 0.0787 + vec2(-uTime * 0.016, uTime * 0.021));
      vec4 t3 = texture2D(uNormal, xr.yx * 0.0069 + vec2(uTime * 0.0021, -uTime * 0.0013));
      vec2 d1 = t1.rg * 2.0 - 1.0, d2 = t2.rg * 2.0 - 1.0, d3 = t3.rg * 2.0 - 1.0;
      float dk = 0.19 * rip * mix(0.55, 1.0, smoothstep(2.0, 40.0, sd));
      vec3 Nw = normalize(vec3(gN.x + (d1.x + 0.7 * d2.x + 0.8 * d3.x) * dk, gN.y, gN.z + (d1.y + 0.7 * d2.y + 0.8 * d3.y) * dk));
      vec3 Vw = normalize(cameraPosition - vec3(xz.x, 0.0, xz.y));
      // --- depth absorption colour from shore distance
      float depth = max(sd, 0.0) + (nA.r - 0.5) * 6.0;
      vec3 cShallow = vec3(0.22, 0.62, 0.54), cMid = vec3(0.045, 0.32, 0.37), cDeep = vec3(0.018, 0.14, 0.23), cAbyss = vec3(0.010, 0.07, 0.15);
      vec3 body = mix(cShallow, cMid, 1.0 - exp(-depth / 9.0));
      body = mix(body, cDeep, 1.0 - exp(-depth / 55.0));
      body = mix(body, cAbyss, smoothstep(120.0, 520.0, depth));
      body *= 0.88 + 0.24 * nA.g;
      // --- foam
      float sdN = sd + (nA.b - 0.5) * 3.5;
      float fContact = 1.0 - smoothstep(0.2, 1.4 + nB.g * 1.4, sdN);
      float bands = smoothstep(0.72, 0.97, sin(sdN * 0.62 + uTime * 1.1) * 0.5 + 0.5) * (1.0 - smoothstep(1.5, 12.0, sdN)) * smoothstep(0.38, 0.62, nB.r);
      float fPile = 1.0 - smoothstep(0.05, 0.55 + nB.b * 0.7, dc);
      float fWake = max(smoothstep(0.22, 0.75, wake * (0.3 + 1.4 * nC.g)), smoothstep(0.25, 0.7, wk.g * (0.45 + 0.9 * nC.r)));
      float crest = clamp(gerstnerDisp(xz, uTime, 1.0).y * 1.6, 0.0, 1.0);
      float caps = smoothstep(0.80, 0.92, texture2D(uNoise, xz * 0.009 + vec2(uTime * 0.003, 0.0)).a + crest * 0.15) * smoothstep(60.0, 160.0, sd) * 0.55;
      float foam = clamp(max(max(fContact, bands * 0.85), max(fPile, fWake)) + caps * nB.r * slick, 0.0, 1.0);
      vec3 aerated = mix(body, vec3(0.30, 0.66, 0.62), clamp(wake * 0.9 + wk.g * 0.5 + fContact * 0.4, 0.0, 0.7));
      float NdV = max(dot(Nw, Vw), 0.0);
      float F = min(0.02 + 0.98 * pow(1.0 - NdV, 5.0), 0.55);
      diffuseColor.rgb = mix(aerated * (1.0 - F) * 0.62, vec3(0.93, 0.92, 0.88), foam);
      // shallow-water caustic shimmer (emissive, sun-scaled)
      float caus = smoothstep(0.86, 1.0, 1.0 - abs(t1.a - t2.a)) * (1.0 - smoothstep(0.5, 9.0, depth)) * (1.0 - foam);
      ${location.search.includes('debug=wake') ? 'diffuseColor.rgb = vec3(wake, fPile, fContact);' : ''}
      `)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n roughnessFactor = mix(0.07, 0.9, foam);`)
    .replace('#include <normal_fragment_maps>', `normal = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 Rw = reflect(-Vw, Nw); Rw.y = max(abs(Rw.y), 0.12); Rw = normalize(Rw);
      vec3 refl = skyColor(Rw) * F * 1.8 * (1.0 - foam);
      // sun / moon glitter: soft sheen + sparse sparkles
      float rs = max(dot(Rw, uSunDir), 0.0);
      float spark = pow(rs, 1600.0) * 2.2 * smoothstep(0.45, 0.75, nB.a);
      vec3 glit = uSunColor * (spark + pow(rs, 70.0) * 0.12 + pow(rs, 12.0) * 0.02) * (1.0 - foam) * mix(0.5, 1.0, slick);
      glit += uSunColor * vec3(0.55, 0.95, 0.85) * caus * 0.10 * max(uSunDir.y, 0.0);
      // lighthouse beam sweeping the water + moving glint
      vec2 rel = xz - uBeamPos.xz; float dist = length(rel);
      float ang = atan(rel.y, rel.x) - uBeamAngle;
      float beamW = 0.0;
      for (int k = 0; k < 2; k++) { float a = ang - float(k) * 3.14159265; a = atan(sin(a), cos(a));
        float lat = abs(sin(a)) * dist, along = cos(a) * dist;
        beamW += exp(-pow(lat / (2.5 + along * 0.075), 2.0)) * step(0.0, along) * smoothstep(8.0, 40.0, along) * exp(-along / 420.0); }
      vec3 Lb = normalize(uBeamPos - vec3(xz.x, 0.0, xz.y)); vec3 Hb = normalize(Lb + Vw);
      float bs = pow(max(dot(Nw, Hb), 0.0), 220.0);
      vec3 beamC = vec3(1.0, 0.78, 0.48);
      vec3 beamLit = beamC * beamW * (0.10 + bs * 9.0) * mix(0.25, 1.0, uNight);
      totalEmissiveRadiance += refl + glit + beamLit;
      `)
    .replace('#include <fog_fragment>', `#include <fog_fragment>
      float proj = dot(xz - uHazeAnchor, uHazeDir);
      float hz = smoothstep(260.0, 1100.0, proj) * 0.92 + smoothstep(700.0, 2200.0, length(xz - uHazeAnchor)) * 0.3;
      vec3 hazeC = skyColor(normalize(vec3(-Vw.x, 0.03, -Vw.z))) * mix(1.0, 0.8, uNight);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeC, clamp(hz, 0.0, 1.0));`);
};
const ocean = new THREE.Mesh(oceanGeometry(), oceanMat);
ocean.receiveShadow = true; ocean.frustumCulled = false; scene.add(ocean);

// ------------------------------------------------------------------ hulls
G = 'hulls';
const HULL_VERT_DECL = `
  attribute float aMat; attribute vec3 aFurl; attribute vec4 iData; attribute vec4 iMove; attribute vec3 iPaint; attribute vec3 iBrand;
  varying float vMat; varying vec2 vEUv; varying vec4 vData; varying vec3 vPaint; varying vec3 vBrand;`;
const HULL_BEGIN = `
  vec3 transformed = mix(aFurl, position, iData.w);
  vec3 ip = instanceMatrix[3].xyz;
  float sh = iMove.y;
  vec3 gd = gerstnerDisp(ip.xz, uTime, sh);
  float roll = iMove.x + (0.035 * sin(uTime * 0.9 + iData.x) + 0.02 * sin(uTime * 1.7 + iData.x * 2.3)) * (0.4 + sh);
  float pitch = (0.025 * sin(uTime * 0.7 + iData.x * 1.3)) * (0.4 + sh);
  float cr = cos(roll), sr = sin(roll); transformed.yz = mat2(cr, sr, -sr, cr) * transformed.yz;
  float cp = cos(pitch), sp = sin(pitch); transformed.xy = mat2(cp, sp, -sp, cp) * transformed.xy;
  transformed.y += gd.y + 0.05 * sin(uTime * 1.3 + iData.x);`;
const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
hullMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U, { uAtlas: { value: atlasTex } });
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${COMMON_GLSL}\n${HULL_VERT_DECL}`)
    .replace('#include <begin_vertex>', `${HULL_BEGIN}\n vMat = aMat; vEUv = uv; vData = iData; vPaint = iPaint; vBrand = iBrand;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\n uniform sampler2D uAtlas; uniform float uNight; varying float vMat; varying vec2 vEUv; varying vec4 vData; varying vec3 vPaint; varying vec3 vBrand;`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 hc = diffuseColor.rgb;
      if (vMat > 0.5 && vMat < 1.5) hc = vPaint;
      else if (vMat > 1.5 && vMat < 2.5) hc = vBrand;
      else if (vMat > 2.5) {
        vec3 canvasC = vData.z < 0.5 ? vec3(0.86, 0.82, 0.72) : (vData.z < 1.5 ? vec3(0.42, 0.17, 0.10) : vec3(0.66, 0.45, 0.16));
        hc = vData.w > 0.5 ? canvasC : vBrand * 0.85;
        if (vMat > 3.5 && vData.w > 0.5) {
          vec2 e = vEUv; float inside = step(0.0, e.x) * step(e.x, 1.0) * step(0.0, e.y) * step(e.y, 1.0);
          float slot = vData.y; vec2 cell = vec2(mod(slot, 16.0), floor(slot / 16.0));
          vec2 auv = vec2((cell.x + clamp(e.x, 0.02, 0.98)) / 16.0, 1.0 - (cell.y + 1.0 - clamp(e.y, 0.02, 0.98)) / 16.0);
          vec4 em = texture2D(uAtlas, auv);
          hc = mix(hc, em.rgb, em.a * inside);
        }
      }
      diffuseColor.rgb = hc;`);
};
const hullDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
hullDepth.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${COMMON_GLSL}\n${HULL_VERT_DECL}`)
    .replace('#include <begin_vertex>', HULL_BEGIN);
};
const hullMeshes = [], moverRefs = [];
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0);
let triTotalHull = 0;
W.CLASSES.forEach((c, ci) => {
  const list = world.perClass[ci], n = list.length, { geometry: g, inst, iib } = W.packHull(THREE, world.hullGeos[ci].geometry, n);
  const mesh = new THREE.InstancedMesh(g, hullMat, n);
  const S_ = W.INST_STRIDE, O = W.INST_OFF;
  list.forEach((h, k) => {
    inst.set([h.phase0, h.emblem, h.family, h.moving ? 1 : 0], k * S_ + O.iData[0]);
    inst.set([h.moving ? 0.15 : 0, h.moving ? 0.9 : 0.22, 0, 0], k * S_ + O.iMove[0]);
    inst.set(h.paint, k * S_ + O.iPaint[0]); inst.set(h.brand, k * S_ + O.iBrand[0]);
    if (!h.moving) { q4.setFromAxisAngle(yAxis, h.wyaw); m4.compose(v3.set(h.x, 0, h.z), q4, s3); mesh.setMatrixAt(k, m4); inst.set([h.x, h.z, h.wyaw, 0], k * S_ + O.iX[0]); }
    else moverRefs.push({ mesh, k, h, ci, inst, iib });
  });
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.iib = iib;
  mesh.customDepthMaterial = hullDepth;
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh); hullMeshes.push(mesh);
  triTotalHull += world.hullGeos[ci].tris * n;
});
ST.S.hulls = world.perClass.reduce((s, l) => s + l.length, 0);
ST.S.hullTris = world.hullGeos.map((h, i) => `${W.CLASSES[i].name}:${h.tris}`).join(' ');

// ------------------------------------------------------------------ piers (decks + posts + piles)
G = 'piers';
{
  const { decks, piles } = world.harbour;
  const deckMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), decks.length + world.harbour.lamps.length);
  const col = new THREE.Color();
  let k = 0;
  for (const d of decks) {
    const [x, z] = W.toWorld(d.a, d.b);
    q4.setFromAxisAngle(yAxis, Math.PI / 4); m4.compose(v3.set(x, d.h - d.t / 2, z), q4, new THREE.Vector3(d.la, d.t, d.lb));
    deckMesh.setMatrixAt(k, m4); deckMesh.setColorAt(k++, col.set(0x8A6B4A).multiplyScalar(0.9 + Math.random() * 0.2));
  }
  for (const l of world.harbour.lamps) {
    const [x, z] = W.toWorld(l.a, l.b); const base = Math.max(1.2, world.terrain.heightAtWorld(x, z));
    const top = Math.max(l.h, base + 4.2);
    q4.identity(); m4.compose(v3.set(x, (base + top) / 2, z), q4, new THREE.Vector3(0.18, top - base, 0.18));
    deckMesh.setMatrixAt(k, m4); deckMesh.setColorAt(k++, col.set(0x2B2F33));
  }
  deckMesh.castShadow = deckMesh.receiveShadow = true; scene.add(deckMesh);
  const pileMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0x4E3B2A, roughness: 0.9 }), piles.length);
  piles.forEach((p, i) => { const [x, z] = W.toWorld(p.a, p.b); q4.identity(); m4.compose(v3.set(x, (p.top - 4) / 2, z), q4, new THREE.Vector3(p.r, p.top + 4, p.r)); pileMesh.setMatrixAt(i, m4); });
  pileMesh.castShadow = true; pileMesh.receiveShadow = true; scene.add(pileMesh);
}

// ------------------------------------------------------------------ town + trees
G = 'town';
{
  const { houses, trees } = world.town;
  const g = W.buildHouseGeometry(THREE);
  const iWall = new Float32Array(houses.length * 3), iRoof = new Float32Array(houses.length * 3), iLit = new Float32Array(houses.length);
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.9 }), houses.length);
  const c = new THREE.Color();
  houses.forEach((h, i) => {
    q4.setFromAxisAngle(yAxis, h.yaw); m4.compose(v3.set(h.x, h.y, h.z), q4, new THREE.Vector3(h.w, h.h, h.d)); mesh.setMatrixAt(i, m4);
    c.set(W.WALLS[h.wall]); iWall.set([c.r, c.g, c.b], i * 3); c.set(W.ROOFS[h.roof]); iRoof.set([c.r, c.g, c.b], i * 3); iLit[i] = h.lit;
  });
  g.setAttribute('iWall', new THREE.InstancedBufferAttribute(iWall, 3)); g.setAttribute('iRoof', new THREE.InstancedBufferAttribute(iRoof, 3)); g.setAttribute('iLit', new THREE.InstancedBufferAttribute(iLit, 1));
  mesh.material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n attribute float aMat; attribute vec3 iWall, iRoof; attribute float iLit; varying float vMat; varying vec3 vWall, vRoof; varying float vLit;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n vMat = aMat; vWall = iWall; vRoof = iRoof; vLit = iLit;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n uniform float uNight; varying float vMat; varying vec3 vWall, vRoof; varying float vLit;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 hc = vWall; float lit = step(0.55, vLit) * uNight;
        if (vMat > 0.5 && vMat < 1.5) hc = vRoof;
        else if (vMat > 1.5 && vMat < 2.5) hc = mix(vec3(0.05, 0.07, 0.09), vec3(0.9, 0.55, 0.25), lit);
        else if (vMat > 2.5 && vMat < 3.5) hc = vec3(0.16, 0.10, 0.07);
        else if (vMat > 3.5) hc = vec3(0.35, 0.32, 0.30);
        diffuseColor.rgb = hc;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vMat > 1.5 && vMat < 2.5) totalEmissiveRadiance += vec3(1.0, 0.58, 0.24) * lit * 2.4;`);
  };
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  const tg = W.buildTreeGeometry(THREE);
  const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), trees.length);
  trees.forEach((t, i) => { q4.setFromAxisAngle(yAxis, i * 2.4); m4.compose(v3.set(t.x, t.y - 0.5, t.z), q4, new THREE.Vector3(t.s, t.s * (0.9 + (i % 5) * 0.06), t.s)); tm.setMatrixAt(i, m4); tm.setColorAt(i, c.setHSL(0.25 + (i % 7) * 0.012, 0.25, 0.5 + (i % 3) * 0.05)); });
  tm.castShadow = tm.receiveShadow = true; scene.add(tm);
}

// ------------------------------------------------------------------ lighthouse + beam
G = 'lighthouse';
{
  const lh = world.lighthouse;
  const m = new THREE.Mesh(lh.geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  m.position.set(lh.x, lh.y - 0.6, lh.z); m.castShadow = m.receiveShadow = true; scene.add(m);
  const glass = new THREE.Mesh(lh.glass, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.5).multiplyScalar(6 * (0.35 + 0.65 * tod.night)) }));
  glass.position.copy(m.position); scene.add(glass);
}
const beamGeo = (() => {
  const L = 340, g1 = new THREE.CylinderGeometry(0.7, 26, L, 40, 16, true); g1.translate(0, -L / 2, 0); g1.rotateZ(Math.PI / 2); g1.rotateZ(-0.012);
  const g2 = g1.clone(); g2.rotateY(Math.PI);
  const n1 = g1.attributes.position.count, P = new Float32Array(n1 * 6), N = new Float32Array(n1 * 6), UV = new Float32Array(n1 * 4), I = [];
  P.set(g1.attributes.position.array); P.set(g2.attributes.position.array, n1 * 3); N.set(g1.attributes.normal.array); N.set(g2.attributes.normal.array, n1 * 3); UV.set(g1.attributes.uv.array); UV.set(g2.attributes.uv.array, n1 * 2);
  const idx = g1.index.array; for (const i of idx) I.push(i); for (const i of idx) I.push(i + n1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setIndex(I);
  return g;
})();
const beamMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uNoise: { value: noiseTex }, uBeamI: { value: 0.35 + 0.65 * tod.night } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uTime, uBeamI; uniform sampler2D uNoise; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){ float along = 1.0 - vUv.y; vec3 v = normalize(cameraPosition - vW);
      float ndv = abs(dot(normalize(vN), v)); float core = pow(ndv, 3.0) * smoothstep(20.0, 160.0, length(cameraPosition - vW));
      float fall = pow(1.0 - along, 1.8) * smoothstep(0.0, 0.025, along);
      float dust = texture2D(uNoise, vec2(along * 3.0 - uTime * 0.02, vUv.x * 3.0)).g;
      float dust2 = texture2D(uNoise, vec2(along * 9.0 - uTime * 0.05, vUv.x * 7.0 + 0.3)).b;
      float a = core * fall * (0.45 + 0.55 * dust * (0.6 + 0.8 * dust2)) * uBeamI;
      gl_FragColor = vec4(vec3(1.0, 0.80, 0.52) * a * 0.9, 1.0); }`,
});
const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(...world.lighthouse.lantern); beam.frustumCulled = false; beam.renderOrder = 10; scene.add(beam);

// ------------------------------------------------------------------ point-ish lights: glow billboards + water pillars
G = 'point-ish';
const LIGHTS = world.lights, NL = LIGHTS.length;
const lPos = new Float32Array(NL * 3), lCol = new Float32Array(NL * 4), lSz = new Float32Array(NL * 2);
LIGHTS.forEach((l, i) => { lPos.set([l.x, l.y, l.z], i * 3); lCol.set([...l.col, l.k], i * 4); lSz.set([l.size, l.kind], i * 2); });
const lPosAttr = new THREE.InstancedBufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage);
ST.S.lights = NL;
function quadIG(attrs) { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, v); g.instanceCount = NL; return g; }
const glowGeo = quadIG({ iPos: lPosAttr, iCol: new THREE.InstancedBufferAttribute(lCol, 4), iSz: new THREE.InstancedBufferAttribute(lSz, 2) });
const glow = new THREE.Mesh(glowGeo, new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  vertexShader: `uniform float uTime, uNight; attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSz; varying vec2 vQ; varying vec4 vC;
    void main(){ vQ = vec2(position.x, position.y - 0.5) * 2.0; float blink = iSz.y > 0.5 ? step(0.0, sin(uTime * 2.2 + iPos.x)) : 1.0;
      vC = vec4(iCol.rgb * iCol.a * uNight * uNight * blink, 1.0);
      vec4 mv = viewMatrix * vec4(iPos, 1.0); mv.xy += vQ * iSz.x * 1.6; mv.z += iSz.x * 1.5; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec2 vQ; varying vec4 vC; void main(){ float r = length(vQ); float core = exp(-r * r * 60.0) * 3.0; float halo = exp(-r * r * 7.0) * 0.18; gl_FragColor = vec4(vC.rgb * (core + halo), 1.0); }`,
}));
glow.frustumCulled = false; glow.renderOrder = 11; scene.add(glow);
const pillarMask = new Float32Array(NL); LIGHTS.forEach((l, i) => { pillarMask[i] = l.pillar ? 1 : 0; });
const pillarGeo = quadIG({ iPos: lPosAttr, iCol: glowGeo.attributes.iCol, iSz: glowGeo.attributes.iSz, iPil: new THREE.InstancedBufferAttribute(pillarMask, 1) });
const pillar = new THREE.Mesh(pillarGeo, new THREE.ShaderMaterial({
  uniforms: { ...U, uNoise: { value: noiseTex } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  vertexShader: `uniform float uTime, uNight; attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSz; attribute float iPil; varying vec2 vQ; varying vec3 vC; varying vec2 vW;
    void main(){ vec2 toCam = normalize(cameraPosition.xz - iPos.xz); vec2 side = vec2(-toCam.y, toCam.x);
      float len = (6.0 + iPos.y * 2.2) * iPil; float wid = (0.8 + iSz.x * 1.2) * iPil;
      vec2 p = iPos.xz + side * position.x * wid + toCam * (position.y - 0.08) * len; vQ = vec2(position.x * 2.0, position.y); vW = p;
      float blink = iSz.y > 0.5 ? step(0.0, sin(uTime * 2.2 + iPos.x)) : 1.0;
      vC = iCol.rgb * iCol.a * uNight * uNight * blink * 0.16;
      gl_Position = projectionMatrix * viewMatrix * vec4(p.x, 0.12, p.y, 1.0); }`,
  fragmentShader: `uniform float uTime; uniform sampler2D uNoise; varying vec2 vQ; varying vec3 vC; varying vec2 vW;
    void main(){ float n = texture2D(uNoise, vec2(vW.x * 0.25, vW.y * 0.06 - uTime * 0.05)).b; float n2 = texture2D(uNoise, vW * 0.11 + uTime * 0.02).r;
      float across = exp(-vQ.x * vQ.x * 3.0); float along = (1.0 - vQ.y) * smoothstep(0.0, 0.1, vQ.y);
      float shimmer = smoothstep(0.35, 0.75, n * 0.7 + n2 * 0.5);
      gl_FragColor = vec4(vC * across * along * (0.25 + 1.6 * shimmer), 1.0); }`,
}));
pillar.frustumCulled = false; pillar.renderOrder = 9; scene.add(pillar);
const lPool = new Float32Array(NL * 2); LIGHTS.forEach((l, i) => { if (l.pool) lPool.set(l.pool, i * 2); });
const poolGeo = quadIG({ iPos: lPosAttr, iCol: glowGeo.attributes.iCol, iPool: new THREE.InstancedBufferAttribute(lPool, 2) });
const pool = new THREE.Mesh(poolGeo, new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  vertexShader: `uniform float uNight; attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iPool; varying vec2 vQ; varying vec3 vC;
    void main(){ vQ = vec2(position.x * 2.0, position.y * 2.0 - 1.0); vC = iCol.rgb * uNight * 0.11;
      vec3 p = vec3(iPos.x + vQ.x * iPool.y, iPool.x, iPos.z + vQ.y * iPool.y); gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `varying vec2 vQ; varying vec3 vC; void main(){ float r2 = dot(vQ, vQ); float f = max(0.0, 1.0 - r2); gl_FragColor = vec4(vC * f * f * f, 1.0); }`,
}));
pool.frustumCulled = false; pool.renderOrder = 8; scene.add(pool);

// ------------------------------------------------------------------ wake render target (ping-pong) + stamps
G = 'wake';
const wakeCam = new THREE.OrthographicCamera(-W.SEA / 2, W.SEA / 2, W.SEA / 2, -W.SEA / 2, -10, 10);
wakeCam.position.set(0, 5, 0); wakeCam.up.set(0, 0, -1); wakeCam.lookAt(0, 0, 0);
const decayMat = new THREE.ShaderMaterial({
  uniforms: { uPrev: { value: null }, uDecay: { value: 0.99 }, uSpread: { value: 0.2 }, uTexel: { value: 1 / 2048 } },
  depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `uniform sampler2D uPrev; uniform float uDecay, uSpread, uTexel; varying vec2 vUv;
    void main(){ float c = texture2D(uPrev, vUv).r; float s = texture2D(uPrev, vUv + vec2(uTexel, 0.0)).r + texture2D(uPrev, vUv - vec2(uTexel, 0.0)).r + texture2D(uPrev, vUv + vec2(0.0, uTexel)).r + texture2D(uPrev, vUv - vec2(0.0, uTexel)).r;
      float v = mix(c, s * 0.25, uSpread) * uDecay; gl_FragColor = vec4(v, 0.0, 0.0, 1.0); } // r = history trail, g = live Kelvin V (re-stamped every frame)`,
});
const decayScene = new THREE.Scene(); { const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), decayMat); q.frustumCulled = false; decayScene.add(q); }
// one stamp per hull instance (docked: contact ring; movers: bow wave + stern trail)
const NH = ST.S.hulls, stA = new Float32Array(NH * 4), stB = new Float32Array(NH * 4);
const stampGeo = new THREE.InstancedBufferGeometry();
stampGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3)); stampGeo.setIndex([0, 2, 1, 0, 3, 2]);
const stAAttr = new THREE.InstancedBufferAttribute(stA, 4).setUsage(THREE.DynamicDrawUsage), stBAttr = new THREE.InstancedBufferAttribute(stB, 4).setUsage(THREE.DynamicDrawUsage);
stampGeo.setAttribute('sA', stAAttr); stampGeo.setAttribute('sB', stBAttr); stampGeo.instanceCount = NH;
const stampMat = new THREE.ShaderMaterial({
  uniforms: { uDt: { value: 0.016 } }, transparent: true, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false,
  vertexShader: `attribute vec4 sA; attribute vec4 sB; varying vec2 vM; varying vec4 vS;
    void main(){ // sA: x, z, yaw, halfLen ; sB: halfBeam, moving, speed, -   (all metres)
      float hl = sA.w, hb = sB.x, wl = hl * 12.0;
      vec2 t = position.xz * 0.5 + 0.5;
      vec2 lo = sB.y > 0.5 ? vec2(-hl - wl, -(wl * 0.4 + hb * 2.0)) : vec2(-hl * 1.4, -hb * 1.9);
      vec2 hi = sB.y > 0.5 ? vec2(hl * 1.3, wl * 0.4 + hb * 2.0) : vec2(hl * 1.4, hb * 1.9);
      vec2 l = mix(lo, hi, t); vM = l; vS = vec4(hl, hb, sB.y, sB.z);
      float c = cos(sA.z), s = sin(sA.z); vec2 w = vec2(sA.x + l.x * c + l.y * s, sA.y - l.x * s + l.y * c);
      gl_Position = vec4(w / ${(W.SEA / 2).toFixed(1)}, 0.0, 1.0); }`,
  fragmentShader: `uniform float uDt; varying vec2 vM; varying vec4 vS;
    void main(){ float hl = vS.x, hb = vS.y;
      float e = length(vec2(vM.x / hl, vM.y / hb * 0.9));
      float ring = exp(-pow((e - 1.05) / 0.18, 2.0)) * 0.12;
      if (vS.z < 0.5) { gl_FragColor = vec4(ring * uDt, 0.0, 0.0, 1.0); return; }
      float stern = exp(-(pow((vM.x + hl * 0.95) / (hl * 0.28), 2.0) + pow(vM.y / (hb * 0.9), 2.0))) * 2.4;
      float u = hl * 0.8 - vM.x;
      float arm = abs(abs(vM.y) - (hb * 0.75 + u * 0.36));
      float w = 0.22 + u * 0.03;
      float V = exp(-(arm * arm) / (w * w)) * smoothstep(0.0, 1.2, u) * exp(-u / (hl * 3.5)) * (1.0 - smoothstep(0.0, 1.0, (vM.x - hl * 0.8)));
      float bowSpray = exp(-(pow((vM.x - hl * 0.85) / (hl * 0.2), 2.0) + pow(vM.y / (hb * 1.1), 2.0))) * 0.6;
      gl_FragColor = vec4((ring * 1.6 + stern) * uDt * vS.w, (V + bowSpray) * vS.w, 0.0, 1.0); }`,
});
const stampScene = new THREE.Scene(); { const m = new THREE.Mesh(stampGeo, stampMat); m.frustumCulled = false; stampScene.add(m); }
{ // static docked stamps
  let o = 0;
  W.CLASSES.forEach((c, ci) => { for (const h of world.perClass[ci]) { h.stampIndex = o; if (!h.moving) { stA.set([h.x, h.z, h.wyaw, c.loa / 2], o * 4); stB.set([c.beam / 2, 0, 0, 0], o * 4); } else { stB.set([c.beam / 2, 1, 1, 0], o * 4); } o++; } });
}
let wakeIdx = 0;
function updateWake(dt) {
  const src = wakeRT[wakeIdx], dst = wakeRT[1 - wakeIdx];
  decayMat.uniforms.uPrev.value = src.texture; decayMat.uniforms.uDecay.value = Math.exp(-dt / 8.0); decayMat.uniforms.uSpread.value = Math.min(1, dt * 18);
  renderer.setRenderTarget(dst); renderer.render(decayScene, wakeCam);
  stampMat.uniforms.uDt.value = dt;
  renderer.autoClear = false; renderer.render(stampScene, wakeCam); renderer.autoClear = true;
  renderer.setRenderTarget(null);
  OU.uWake.value = dst.texture; wakeIdx = 1 - wakeIdx;
}

// ------------------------------------------------------------------ movers
G = 'movers';
const moverLightIdx = world.moverLight0;
function updateMovers(t) {
  moverRefs.forEach((r, i) => {
    const s = W.moverState(r.h, t), c = W.CLASSES[r.ci];
    q4.setFromAxisAngle(yAxis, s.yaw); m4.compose(v3.set(s.x, 0, s.z), q4, s3); r.mesh.setMatrixAt(r.k, m4);
    r.inst[r.k * W.INST_STRIDE + W.INST_OFF.iMove[0]] = s.heel; r.inst.set([s.x, s.z, s.yaw], r.k * W.INST_STRIDE + W.INST_OFF.iX[0]);
    const o = r.h.stampIndex; stA[o * 4] = s.x; stA[o * 4 + 1] = s.z; stA[o * 4 + 2] = s.yaw; stA[o * 4 + 3] = c.loa / 2;
    const mt = world.hullGeos[r.ci].mastTop; lPos[(moverLightIdx + i) * 3] = s.x + Math.cos(s.yaw) * mt[0] - Math.sin(s.heel) * mt[1] * Math.sin(s.yaw); lPos[(moverLightIdx + i) * 3 + 1] = mt[1] * Math.cos(s.heel); lPos[(moverLightIdx + i) * 3 + 2] = s.z - Math.sin(s.yaw) * mt[0] - Math.sin(s.heel) * mt[1] * Math.cos(s.yaw);
  });
  for (const m of hullMeshes) { m.instanceMatrix.needsUpdate = true; m.userData.iib.needsUpdate = true; }
  stAAttr.needsUpdate = true; lPosAttr.needsUpdate = true;
}

// ------------------------------------------------------------------ post
G = 'post';
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
composer.addPass(new RenderPass(scene, camera));
const bloom = new BloomEffect({ mipmapBlur: true, intensity: 1.1, luminanceThreshold: 0.85, luminanceSmoothing: 0.25, radius: 0.72 });
const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
composer.addPass(new EffectPass(camera, bloom, tone));
composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));

// ------------------------------------------------------------------ loop
G = 'loop';
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
const tOffset = P.t ?? 40;
let last = performance.now(), tStart = performance.now(), firstDone = false;
for (let i = 0; i < 300; i++) { updateMovers(tOffset - 10 + i / 30); updateWake(1 / 30); } // warm the wake field along real mover history

scene.traverse((o) => { if (o.userData.g && OFF.has(o.userData.g)) o.visible = false; });
if (OFF.has('shadow')) renderer.shadowMap.enabled = false;
ST.S.off = [...OFF].join(',');
const tc0 = performance.now();
await renderer.compileAsync(scene, camera);
ST.mark('compileMs', performance.now() - tc0);

function renderStep(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const c0 = performance.now();
  renderer.info.reset();
  timer.poll();
  timer.begin();
  const t = P.still ? tOffset : tOffset + (now - tStart) / 1000;
  U.uTime.value = t;
  U.uBeamAngle.value = -(t * 2 * Math.PI / 12.0);
  beam.rotation.y = -U.uBeamAngle.value;
  updateMovers(t);
  if (!OFF.has('wake')) updateWake(P.still ? 0 : dt);
  if (OFF.has('post')) renderer.render(scene, camera); else composer.render(dt);
  timer.end();
  ST.cpu(performance.now() - c0);
  ST.S.drawCalls = renderer.info.render.calls; ST.S.triangles = renderer.info.render.triangles;
  if (!firstDone) { firstDone = true; requestAnimationFrame(() => ST.mark('firstFrame')); }
}
let benching = false;
function frame(now) { ST.raf(now); if (!benching) renderStep(now); requestAnimationFrame(frame); }
// Throughput bench: K frames back-to-back, each one synced (readPixels / onSubmittedWorkDone),
// so per-frame time = full CPU+GPU cost of one frame, independent of vsync and of timer queries.
const preStep = () => {};
const syncGPU = async () => { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
window.__bench = async (K = 240) => {
  benching = true; await new Promise((r) => setTimeout(r, 50)); await syncGPU();
  const per = []; let fake = performance.now();
  for (let i = 0; i < K; i++) { const t0 = performance.now(); fake += 1000 / 60; preStep(); renderStep(fake); await syncGPU(); per.push(performance.now() - t0); }
  const t1 = performance.now(); for (let i = 0; i < K; i++) { fake += 1000 / 60; preStep(); renderStep(fake); } await syncGPU(); const pipelined = (performance.now() - t1) / K;
  benching = false; per.sort((a, b) => a - b);
  const q = (x) => +per[Math.min(per.length - 1, Math.floor(x * per.length))].toFixed(3);
  return { K, p50: q(0.5), p95: q(0.95), max: q(1), pipelinedAvg: +pipelined.toFixed(3) };
};
ST.S.canvas = `${renderer.domElement.width}x${renderer.domElement.height}`;
ST.S.timer = timer.ok ? 'EXT_disjoint_timer_query_webgl2 (whole frame)' : 'none';
requestAnimationFrame(frame);
