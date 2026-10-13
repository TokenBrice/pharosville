// Scene B: WebGPURenderer + TSL + three's post nodes. Same world as scene A.
// ?webgl forces the WebGL2 backend; otherwise WebGPU when an adapter exists, else automatic WebGL2 fallback.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, attribute, texture, uv, vec2, vec3, vec4, float, sin, cos, mix, smoothstep, exp, pow, dot, normalize, length, max, min, clamp, abs,
  step, floor, mod, reflect, atan, select, positionGeometry, positionWorld, normalWorld, cameraPosition, cameraViewMatrix, cameraProjectionMatrix,
  varying, pass, renderOutput, output,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import * as W from './world.js';
import { makeStats } from './stats.js';

const T0 = performance.now();
let G = 'misc';
const P = W.params();
const forceWebGL = new URLSearchParams(location.search).has('webgl');
const ST = makeStats('B webgpu-renderer+tsl+post-nodes');
ST.mark('moduleStart', T0);

const world = W.buildWorld(THREE);
ST.mark('worldGenMs', world.genMs);
const tod = W.TOD[P.tod] ?? W.TOD.night;
const sun = W.sunDir(tod);

// ------------------------------------------------------------------ renderer
G = 'renderer';
const canvas = document.getElementById('c');
const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, trackTimestamp: true, forceWebGL, powerPreference: 'high-performance' });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.info.autoReset = false;
await renderer.init();
ST.S.backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2 (WebGPURenderer fallback)';
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
const uTime = uniform(0);
const uNight = uniform(tod.night);
const uSunDir = uniform(new THREE.Vector3(...sun));
const uSunColor = uniform(new THREE.Color(tod.sun).multiplyScalar(tod.sunI));
const uZenith = uniform(new THREE.Color(tod.zenith)), uHorizon = uniform(new THREE.Color(tod.horizon)), uHaze = uniform(new THREE.Color(tod.haze));
const uBeamAngle = uniform(0);
const uBeamPos = uniform(new THREE.Vector3(...world.lighthouse.lantern));
const uHazeAnchor = uniform(new THREE.Vector2(pose.target[0], pose.target[2]));
const uHazeDir = uniform(new THREE.Vector2(pose.target[0] - pose.pos[0], pose.target[2] - pose.pos[2]).normalize());

function dataTex(data, n) {
  const arr = new Uint16Array(data.length); for (let i = 0; i < data.length; i++) arr[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const t = new THREE.DataTexture(arr, n, n, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}
const shoreTex = dataTex(world.shore.data, world.shore.n);
const contactTex = dataTex(world.contact.data, world.contact.n);
const rgbaTex = (o) => { const t = new THREE.DataTexture(o.data, o.size, o.size, THREE.RGBAFormat, THREE.UnsignedByteType); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t; };
const normalTex = rgbaTex(world.normal);
const noiseTex = rgbaTex(world.noise);
const atlasTex = new THREE.CanvasTexture(world.atlas); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 8; atlasTex.generateMipmaps = true; atlasTex.minFilter = THREE.LinearMipmapLinearFilter;

// ------------------------------------------------------------------ TSL library (mirrors the GLSL in a.js)
const WAVES = W.WAVES.map(([dx, dz, L, A, steep]) => {
  const len = Math.hypot(dx, dz), x = dx / len, z = dz / len, k = 2 * Math.PI / L, w = Math.sqrt(9.81 * k) * 0.8, Q = steep / (k * A * W.WAVES.length);
  return { x, z, k, w, A, Q };
});
const wavePhase = (p, t, v) => dot(vec2(v.x, v.z), p).mul(v.k).sub(t.mul(v.w));
function gerstnerDisp(p, t, amp) {
  let d = vec3(0);
  for (const v of WAVES) { const f = wavePhase(p, t, v), c = cos(f); d = d.add(vec3(c.mul(v.Q * v.A * v.x), sin(f).mul(v.A), c.mul(v.Q * v.A * v.z))); }
  return d.mul(amp);
}
function gerstnerNormal(p, t, amp) {
  let n = vec3(0, 1, 0);
  for (const v of WAVES) { const f = wavePhase(p, t, v), c = cos(f), wa = amp.mul(v.k * v.A); n = n.sub(vec3(c.mul(wa).mul(v.x), sin(f).mul(amp).mul(v.Q * v.k * v.A), c.mul(wa).mul(v.z))); }
  return normalize(n);
}
const skyColor = (d) => {
  const h = d.y;
  let c = mix(uHorizon, uZenith, pow(clamp(h, 0, 1), 0.5));
  c = mix(c, uHaze, smoothstep(0.02, -0.15, h));
  const sd = max(dot(d, uSunDir), 0);
  return c.add(uSunColor.mul(pow(sd, 6).mul(0.10).add(pow(sd, 48).mul(0.25))).mul(uNight.mul(-0.6).add(1)));
};
const SEA = W.SEA;

// ------------------------------------------------------------------ sky dome
G = 'sky';
{
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  m.fog = false;
  m.colorNode = Fn(() => {
    const d = normalize(positionGeometry).toVar();
    const c = skyColor(d).toVar();
    c.addAssign(uSunColor.mul(smoothstep(0.9993, 0.9997, dot(d, uSunDir))).mul(4));
    const sp = d.xz.div(max(d.y.add(0.25), 0.05)).mul(6);
    const st = texture(noiseTex, sp).r.mul(texture(noiseTex, sp.mul(3.7)).g);
    c.addAssign(vec3(0.9, 0.95, 1.0).mul(smoothstep(0.42, 0.5, st)).mul(smoothstep(0.05, 0.3, d.y)).mul(uNight).mul(2.5));
    return vec4(c, 1);
  })();
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
const terrain = new THREE.Mesh(world.terrain.geometry, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
terrain.castShadow = terrain.receiveShadow = true; scene.add(terrain);

// ------------------------------------------------------------------ wake render targets (declared before the ocean samples them)
G = 'wake';
const wakeRT = [0, 1].map(() => new THREE.RenderTarget(2048, 2048, { type: THREE.HalfFloatType, format: THREE.RGFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
const wakeTexNode = texture(wakeRT[0].texture);

// ------------------------------------------------------------------ ocean
G = 'ocean';
function oceanGeometry() {
  const N = 180, Pp = [], I = [];
  const map = (u) => { const a = Math.abs(u), s = Math.sign(u); return a <= 0.85 ? u / 0.85 * 640 : s * (640 + ((a - 0.85) / 0.15) ** 2 * 5400); };
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) Pp.push(map(-1 + 2 * i / N), 0, map(-1 + 2 * j / N));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setIndex(I);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(Pp.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  return g;
}
const oceanMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0 });
{
  const contactCenter = vec2(...world.contact.center), contactSize = float(world.contact.size);
  // vertex: gerstner displacement damped near shore and at the grid edge
  oceanMat.positionNode = Fn(() => {
    const p = positionGeometry;
    const sdv = texture(shoreTex, p.xz.div(SEA).add(0.5)).r;
    const damp = smoothstep(1.0, 28.0, sdv).mul(smoothstep(520.0, 640.0, max(abs(p.x), abs(p.z))).oneMinus());
    return p.add(gerstnerDisp(p.xz, uTime, damp));
  })();
  // fragment: everything below is evaluated once per pixel and shared by colour/normal/roughness/emissive
  const xz = positionGeometry.xz;
  const S = {};
  {
    const outside = step(SEA / 2, max(abs(xz.x), abs(xz.y)));
    const sd = mix(texture(shoreTex, xz.div(SEA).add(0.5)).r, 400.0, outside).toVar();
    const damp = smoothstep(1.0, 28.0, sd).mul(smoothstep(520.0, 640.0, max(abs(xz.x), abs(xz.y))).oneMinus());
    const dc = texture(contactTex, xz.sub(contactCenter).div(contactSize).add(0.5)).r;
    const wk = wakeTexNode.sample(xz.div(SEA).add(0.5)).rg.mul(outside.oneMinus()).toVar();
    const wake = wk.r;
    const nC = texture(noiseTex, xz.mul(0.17).add(vec2(uTime.mul(0.02), 0))).toVar();
    const nA = texture(noiseTex, xz.mul(0.0035)).toVar();
    const nB = texture(noiseTex, xz.mul(0.021).add(vec2(uTime.mul(0.004), uTime.mul(-0.003)))).toVar();
    const slick = smoothstep(0.30, 0.72, texture(noiseTex, xz.mul(0.0013).add(vec2(uTime.mul(0.0011), uTime.mul(0.0004)))).g).toVar();
    const rip = mix(0.35, 1.0, slick);
    const camD = length(cameraPosition.xz.sub(xz));
    const gN = gerstnerNormal(xz, uTime, max(damp, 0.35).mul(0.4).mul(mix(1.0, 0.25, smoothstep(500.0, 1500.0, camD)))).toVar();
    const t1 = texture(normalTex, xz.mul(0.031).add(vec2(uTime.mul(0.012), uTime.mul(0.007)))).toVar();
    const xr = vec2(xz.x.mul(0.825).sub(xz.y.mul(0.565)), xz.x.mul(0.565).add(xz.y.mul(0.825)));
    const t2 = texture(normalTex, xr.mul(0.0787).add(vec2(uTime.mul(-0.016), uTime.mul(0.021)))).toVar();
    const t3 = texture(normalTex, xr.yx.mul(0.0069).add(vec2(uTime.mul(0.0021), uTime.mul(-0.0013))));
    const d1 = t1.rg.mul(2).sub(1), d2 = t2.rg.mul(2).sub(1), d3 = t3.rg.mul(2).sub(1);
    const dk = float(0.19).mul(rip).mul(mix(0.55, 1.0, smoothstep(2.0, 40.0, sd)));
    const Nw = normalize(vec3(gN.x.add(d1.x.add(d2.x.mul(0.7)).add(d3.x.mul(0.8)).mul(dk)), gN.y, gN.z.add(d1.y.add(d2.y.mul(0.7)).add(d3.y.mul(0.8)).mul(dk)))).toVar();
    const Vw = normalize(cameraPosition.sub(vec3(xz.x, 0, xz.y))).toVar();
    const depth = max(sd, 0).add(nA.r.sub(0.5).mul(6)).toVar();
    let body = mix(vec3(0.22, 0.62, 0.54), vec3(0.045, 0.32, 0.37), exp(depth.negate().div(9)).oneMinus());
    body = mix(body, vec3(0.018, 0.14, 0.23), exp(depth.negate().div(55)).oneMinus());
    body = mix(body, vec3(0.010, 0.07, 0.15), smoothstep(120, 520, depth)).mul(nA.g.mul(0.24).add(0.88));
    const sdN = sd.add(nA.b.sub(0.5).mul(3.5));
    const fContact = smoothstep(0.2, nB.g.mul(1.4).add(1.4), sdN).oneMinus();
    const bands = smoothstep(0.72, 0.97, sin(sdN.mul(0.62).add(uTime.mul(1.1))).mul(0.5).add(0.5)).mul(smoothstep(1.5, 12.0, sdN).oneMinus()).mul(smoothstep(0.38, 0.62, nB.r));
    const fPile = smoothstep(0.05, nB.b.mul(0.7).add(0.55), dc).oneMinus();
    const fWake = max(smoothstep(0.22, 0.75, wake.mul(nC.g.mul(1.4).add(0.3))), smoothstep(0.25, 0.7, wk.g.mul(nC.r.mul(0.9).add(0.45))));
    const crest = clamp(gerstnerDisp(xz, uTime, float(1)).y.mul(1.6), 0, 1);
    const caps = smoothstep(0.80, 0.92, texture(noiseTex, xz.mul(0.009).add(vec2(uTime.mul(0.003), 0))).a.add(crest.mul(0.15))).mul(smoothstep(60, 160, sd)).mul(0.55);
    const foam = clamp(max(max(fContact, bands.mul(0.85)), max(fPile, fWake)).add(caps.mul(nB.r).mul(slick)), 0, 1).toVar();
    const aerated = mix(body, vec3(0.30, 0.66, 0.62), clamp(wake.mul(0.9).add(wk.g.mul(0.5)).add(fContact.mul(0.4)), 0, 0.7));
    const NdV = max(dot(Nw, Vw), 0);
    const F = min(pow(NdV.oneMinus(), 5).mul(0.98).add(0.02), 0.55).toVar();
    S.color = mix(aerated.mul(F.oneMinus()).mul(0.62), vec3(0.93, 0.92, 0.88), foam);
    const caus = smoothstep(0.86, 1.0, abs(t1.a.sub(t2.a)).oneMinus()).mul(smoothstep(0.5, 9.0, depth).oneMinus()).mul(foam.oneMinus());
    // emissive: sky reflection + sun glitter + beam sweep
    const Rw0 = reflect(Vw.negate(), Nw); const Rw = normalize(vec3(Rw0.x, max(abs(Rw0.y), 0.12), Rw0.z)).toVar();
    const refl = skyColor(Rw).mul(F).mul(1.8).mul(foam.oneMinus());
    const rs = max(dot(Rw, uSunDir), 0);
    const spark = pow(rs, 1600).mul(2.2).mul(smoothstep(0.45, 0.75, nB.a));
    let glit = uSunColor.mul(spark.add(pow(rs, 70).mul(0.12)).add(pow(rs, 12).mul(0.02))).mul(foam.oneMinus()).mul(mix(0.5, 1.0, slick));
    glit = glit.add(uSunColor.mul(vec3(0.55, 0.95, 0.85)).mul(caus).mul(0.10).mul(max(uSunDir.y, 0)));
    const rel = xz.sub(uBeamPos.xz), dist = length(rel);
    const ang = atan(rel.y, rel.x).sub(uBeamAngle);
    let beamW = float(0);
    for (let k = 0; k < 2; k++) {
      const a0 = ang.sub(k * Math.PI), a = atan(sin(a0), cos(a0));
      const lat = abs(sin(a)).mul(dist), along = cos(a).mul(dist);
      beamW = beamW.add(exp(pow(lat.div(along.mul(0.075).add(2.5)), 2).negate()).mul(step(0, along)).mul(smoothstep(8, 40, along)).mul(exp(along.negate().div(420))));
    }
    const Lb = normalize(uBeamPos.sub(vec3(xz.x, 0, xz.y))), Hb = normalize(Lb.add(Vw));
    const bs = pow(max(dot(Nw, Hb), 0), 220);
    const beamLit = vec3(1.0, 0.78, 0.48).mul(beamW).mul(bs.mul(9).add(0.10)).mul(mix(0.25, 1.0, uNight));
    S.emissive = refl.add(glit).add(beamLit);
    S.normal = normalize(cameraViewMatrix.mul(vec4(Nw, 0)).xyz);
    S.rough = mix(0.07, 0.9, foam);
    S.hazeC = skyColor(normalize(vec3(Vw.x.negate(), 0.03, Vw.z.negate()))).mul(mix(1.0, 0.8, uNight));
    const proj = dot(xz.sub(uHazeAnchor), uHazeDir);
    S.haze = clamp(smoothstep(260, 1100, proj).mul(0.92).add(smoothstep(700, 2200, length(xz.sub(uHazeAnchor))).mul(0.3)), 0, 1);
  }
  oceanMat.colorNode = vec4(S.color, 1);
  oceanMat.normalNode = S.normal;
  oceanMat.roughnessNode = S.rough;
  oceanMat.emissiveNode = S.emissive;
  oceanMat.outputNode = vec4(mix(output.rgb, S.hazeC, S.haze), output.a);
}
const ocean = new THREE.Mesh(oceanGeometry(), oceanMat);
ocean.receiveShadow = true; ocean.frustumCulled = false; scene.add(ocean);

// ------------------------------------------------------------------ hulls
G = 'hulls';
// NOTE: in WebGPURenderer, instancing is applied BEFORE material.positionNode, so the hull
// transform is rebuilt here from a per-instance xform attribute (x, z, yaw) instead.
const hullMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
{
  const iData = attribute('iData', 'vec4'), iMove = attribute('iMove', 'vec4'), iX = attribute('iX', 'vec4');
  hullMat.positionNode = Fn(() => {
    const p = mix(attribute('aFurl', 'vec3'), positionGeometry, iData.w).toVar();
    const sh = iMove.y;
    const gd = gerstnerDisp(iX.xy, uTime, sh);
    const roll = iMove.x.add(sin(uTime.mul(0.9).add(iData.x)).mul(0.035).add(sin(uTime.mul(1.7).add(iData.x.mul(2.3))).mul(0.02)).mul(sh.add(0.4)));
    const pitch = sin(uTime.mul(0.7).add(iData.x.mul(1.3))).mul(0.025).mul(sh.add(0.4));
    const cr = cos(roll), sr = sin(roll);
    const y1 = cr.mul(p.y).sub(sr.mul(p.z)), z1 = sr.mul(p.y).add(cr.mul(p.z));
    const cp = cos(pitch), spn = sin(pitch);
    const x2 = cp.mul(p.x).sub(spn.mul(y1)), y2 = spn.mul(p.x).add(cp.mul(y1));
    const yb = y2.add(gd.y).add(sin(uTime.mul(1.3).add(iData.x)).mul(0.05));
    const cy = cos(iX.z), sy = sin(iX.z);
    return vec3(cy.mul(x2).add(sy.mul(z1)).add(iX.x), yb, sy.negate().mul(x2).add(cy.mul(z1)).add(iX.y));
  })();
  const aMat = attribute('aMat', 'float'), vPaint = attribute('iPaint', 'vec3'), vBrand = attribute('iBrand', 'vec3');
  hullMat.colorNode = Fn(() => {
    const base = attribute('color', 'vec3');
    const canvasC = select(iData.z.lessThan(0.5), vec3(0.86, 0.82, 0.72), select(iData.z.lessThan(1.5), vec3(0.42, 0.17, 0.10), vec3(0.66, 0.45, 0.16)));
    const sail = select(iData.w.greaterThan(0.5), canvasC, vBrand.mul(0.85)).toVar();
    const e = uv();
    const inside = step(0, e.x).mul(step(e.x, 1)).mul(step(0, e.y)).mul(step(e.y, 1));
    const slot = iData.y, cell = vec2(mod(slot, 16), floor(slot.div(16)));
    const auv = vec2(cell.x.add(clamp(e.x, 0.02, 0.98)).div(16), cell.y.add(1).sub(clamp(e.y, 0.02, 0.98)).div(16).oneMinus());
    const em = texture(atlasTex, auv);
    const useEm = step(3.5, aMat).mul(step(0.5, iData.w)).mul(inside).mul(em.a);
    const sailC = mix(sail, em.rgb, useEm);
    const c = select(aMat.lessThan(0.5), base, select(aMat.lessThan(1.5), vPaint, select(aMat.lessThan(2.5), vBrand, sailC)));
    return vec4(c, 1);
  })();
}
const hullMeshes = [], moverRefs = [];
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0);
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
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh); hullMeshes.push(mesh);
});
ST.S.hulls = world.perClass.reduce((s, l) => s + l.length, 0);
ST.S.hullTris = world.hullGeos.map((h, i) => `${W.CLASSES[i].name}:${h.tris}`).join(' ');

// ------------------------------------------------------------------ piers
G = 'piers';
{
  const { decks, piles } = world.harbour;
  const deckMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardNodeMaterial({ roughness: 0.85 }), decks.length + world.harbour.lamps.length);
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
  const pileMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), new THREE.MeshStandardNodeMaterial({ color: 0x4E3B2A, roughness: 0.9 }), piles.length);
  piles.forEach((p, i) => { const [x, z] = W.toWorld(p.a, p.b); q4.identity(); m4.compose(v3.set(x, (p.top - 4) / 2, z), q4, new THREE.Vector3(p.r, p.top + 4, p.r)); pileMesh.setMatrixAt(i, m4); });
  pileMesh.castShadow = true; pileMesh.receiveShadow = true; scene.add(pileMesh);
}

// ------------------------------------------------------------------ town + trees
G = 'town';
{
  const { houses, trees } = world.town;
  const g = W.buildHouseGeometry(THREE);
  const iWall = new Float32Array(houses.length * 3), iRoof = new Float32Array(houses.length * 3), iLit = new Float32Array(houses.length);
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(g, mat, houses.length);
  const c = new THREE.Color();
  houses.forEach((h, i) => {
    q4.setFromAxisAngle(yAxis, h.yaw); m4.compose(v3.set(h.x, h.y, h.z), q4, new THREE.Vector3(h.w, h.h, h.d)); mesh.setMatrixAt(i, m4);
    c.set(W.WALLS[h.wall]); iWall.set([c.r, c.g, c.b], i * 3); c.set(W.ROOFS[h.roof]); iRoof.set([c.r, c.g, c.b], i * 3); iLit[i] = h.lit;
  });
  g.setAttribute('iWall', new THREE.InstancedBufferAttribute(iWall, 3)); g.setAttribute('iRoof', new THREE.InstancedBufferAttribute(iRoof, 3)); g.setAttribute('iLit', new THREE.InstancedBufferAttribute(iLit, 1));
  const aMat = attribute('aMat', 'float'), lit = step(0.55, attribute('iLit', 'float')).mul(uNight);
  const isWin = step(1.5, aMat).mul(step(aMat, 2.5));
  mat.colorNode = vec4(select(aMat.lessThan(0.5), attribute('iWall', 'vec3'), select(aMat.lessThan(1.5), attribute('iRoof', 'vec3'),
    select(aMat.lessThan(2.5), mix(vec3(0.05, 0.07, 0.09), vec3(0.9, 0.55, 0.25), lit), select(aMat.lessThan(3.5), vec3(0.16, 0.10, 0.07), vec3(0.35, 0.32, 0.30))))), 1);
  mat.emissiveNode = vec3(1.0, 0.58, 0.24).mul(lit).mul(2.4).mul(isWin);
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  const tg = W.buildTreeGeometry(THREE);
  const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), trees.length);
  trees.forEach((t, i) => { q4.setFromAxisAngle(yAxis, i * 2.4); m4.compose(v3.set(t.x, t.y - 0.5, t.z), q4, new THREE.Vector3(t.s, t.s * (0.9 + (i % 5) * 0.06), t.s)); tm.setMatrixAt(i, m4); tm.setColorAt(i, c.setHSL(0.25 + (i % 7) * 0.012, 0.25, 0.5 + (i % 3) * 0.05)); });
  tm.castShadow = tm.receiveShadow = true; scene.add(tm);
}

// ------------------------------------------------------------------ lighthouse + beam
G = 'lighthouse';
{
  const lh = world.lighthouse;
  const m = new THREE.Mesh(lh.geometry, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85 }));
  m.position.set(lh.x, lh.y - 0.6, lh.z); m.castShadow = m.receiveShadow = true; scene.add(m);
  const glass = new THREE.Mesh(lh.glass, new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1.0, 0.8, 0.5).multiplyScalar(6 * (0.35 + 0.65 * tod.night)) }));
  glass.position.copy(m.position); scene.add(glass);
}
const beamGeo = (() => {
  const L = 340, g1 = new THREE.CylinderGeometry(0.7, 26, L, 40, 16, true); g1.translate(0, -L / 2, 0); g1.rotateZ(Math.PI / 2); g1.rotateZ(-0.012);
  const g2 = g1.clone(); g2.rotateY(Math.PI);
  const n1 = g1.attributes.position.count, Pp = new Float32Array(n1 * 6), N = new Float32Array(n1 * 6), UV = new Float32Array(n1 * 4), I = [];
  Pp.set(g1.attributes.position.array); Pp.set(g2.attributes.position.array, n1 * 3); N.set(g1.attributes.normal.array); N.set(g2.attributes.normal.array, n1 * 3); UV.set(g1.attributes.uv.array); UV.set(g2.attributes.uv.array, n1 * 2);
  const idx = g1.index.array; for (const i of idx) I.push(i); for (const i of idx) I.push(i + n1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setIndex(I);
  return g;
})();
const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
beamMat.fog = false;
{
  const uBeamI = uniform(0.35 + 0.65 * tod.night);
  beamMat.colorNode = Fn(() => {
    const along = uv().y.oneMinus();
    const v = normalize(cameraPosition.sub(positionWorld));
    const ndv = abs(dot(normalize(normalWorld), v));
    const core = pow(ndv, 3.0).mul(smoothstep(20.0, 160.0, length(cameraPosition.sub(positionWorld))));
    const fall = pow(along.oneMinus(), 1.8).mul(smoothstep(0.0, 0.025, along));
    const dust = texture(noiseTex, vec2(along.mul(3).sub(uTime.mul(0.02)), uv().x.mul(3))).g;
    const dust2 = texture(noiseTex, vec2(along.mul(9).sub(uTime.mul(0.05)), uv().x.mul(7).add(0.3))).b;
    const a = core.mul(fall).mul(dust.mul(dust2.mul(0.8).add(0.6)).mul(0.55).add(0.45)).mul(uBeamI);
    return vec4(vec3(1.0, 0.80, 0.52).mul(a).mul(0.9), 1);
  })();
}
const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(...world.lighthouse.lantern); beam.frustumCulled = false; beam.renderOrder = 10; scene.add(beam);

// ------------------------------------------------------------------ point-ish lights: glow billboards + water pillars + light pools
G = 'point-ish';
const LIGHTS = world.lights, NL = LIGHTS.length;
const lPos = new Float32Array(NL * 3), lCol = new Float32Array(NL * 4), lSz = new Float32Array(NL * 2);
LIGHTS.forEach((l, i) => { lPos.set([l.x, l.y, l.z], i * 3); lCol.set([...l.col, l.k], i * 4); lSz.set([l.size, l.kind], i * 2); });
const lPosAttr = new THREE.InstancedBufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage);
ST.S.lights = NL;
function quadIG(attrs) { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, v); g.instanceCount = NL; return g; }
const addMat = (side = THREE.FrontSide) => { const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side }); m.fog = false; return m; };
const iColAttr = new THREE.InstancedBufferAttribute(lCol, 4), iSzAttr = new THREE.InstancedBufferAttribute(lSz, 2);
const iPos = attribute('iPos', 'vec3'), iCol = attribute('iCol', 'vec4'), iSz = attribute('iSz', 'vec2');
const blink = select(iSz.y.greaterThan(0.5), step(0, sin(uTime.mul(2.2).add(iPos.x))), float(1));
{
  const m = addMat();
  const q = vec2(positionGeometry.x, positionGeometry.y.sub(0.5)).mul(2);
  const mv = cameraViewMatrix.mul(vec4(iPos, 1)).add(vec4(q.mul(iSz.x.mul(1.6)), iSz.x.mul(1.5), 0));
  m.vertexNode = cameraProjectionMatrix.mul(mv);
  const vq = varying(q), vc = varying(iCol.rgb.mul(iCol.a).mul(uNight).mul(uNight).mul(blink));
  const r = length(vq);
  m.colorNode = vec4(vc.mul(exp(r.mul(r).mul(-60)).mul(3).add(exp(r.mul(r).mul(-7)).mul(0.18))), 1);
  const glow = new THREE.Mesh(quadIG({ iPos: lPosAttr, iCol: iColAttr, iSz: iSzAttr }), m); glow.frustumCulled = false; glow.renderOrder = 11; scene.add(glow);
}
{
  const pillarMask = new Float32Array(NL); LIGHTS.forEach((l, i) => { pillarMask[i] = l.pillar ? 1 : 0; });
  const m = addMat(THREE.DoubleSide);
  const iPil = attribute('iPil', 'float');
  const toCam = normalize(cameraPosition.xz.sub(iPos.xz)), side = vec2(toCam.y.negate(), toCam.x);
  const len = iPos.y.mul(2.2).add(6).mul(iPil), wid = iSz.x.mul(1.2).add(0.8).mul(iPil);
  const p = iPos.xz.add(side.mul(positionGeometry.x).mul(wid)).add(toCam.mul(positionGeometry.y.sub(0.08)).mul(len));
  m.vertexNode = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(p.x, 0.12, p.y, 1)));
  const vq = varying(vec2(positionGeometry.x.mul(2), positionGeometry.y)), vw = varying(p), vc = varying(iCol.rgb.mul(iCol.a).mul(uNight).mul(uNight).mul(blink).mul(0.16));
  const n = texture(noiseTex, vec2(vw.x.mul(0.25), vw.y.mul(0.06).sub(uTime.mul(0.05)))).b, n2 = texture(noiseTex, vw.mul(0.11).add(uTime.mul(0.02))).r;
  const across = exp(vq.x.mul(vq.x).mul(-3)), along = vq.y.oneMinus().mul(smoothstep(0, 0.1, vq.y));
  const shimmer = smoothstep(0.35, 0.75, n.mul(0.7).add(n2.mul(0.5)));
  m.colorNode = vec4(vc.mul(across).mul(along).mul(shimmer.mul(1.6).add(0.25)), 1);
  const pillar = new THREE.Mesh(quadIG({ iPos: lPosAttr, iCol: iColAttr, iSz: iSzAttr, iPil: new THREE.InstancedBufferAttribute(pillarMask, 1) }), m); pillar.frustumCulled = false; pillar.renderOrder = 9; scene.add(pillar);
}
{
  const lPool = new Float32Array(NL * 2); LIGHTS.forEach((l, i) => { if (l.pool) lPool.set(l.pool, i * 2); });
  const m = addMat(THREE.DoubleSide); m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  const iPool = attribute('iPool', 'vec2');
  const q = vec2(positionGeometry.x.mul(2), positionGeometry.y.mul(2).sub(1));
  m.vertexNode = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(iPos.x.add(q.x.mul(iPool.y)), iPool.x, iPos.z.add(q.y.mul(iPool.y)), 1)));
  const vq = varying(q), vc = varying(iCol.rgb.mul(uNight).mul(0.11));
  const f = max(dot(vq, vq).oneMinus(), 0);
  m.colorNode = vec4(vc.mul(f.mul(f).mul(f)), 1);
  const pool = new THREE.Mesh(quadIG({ iPos: lPosAttr, iCol: iColAttr, iPool: new THREE.InstancedBufferAttribute(lPool, 2) }), m); pool.frustumCulled = false; pool.renderOrder = 8; scene.add(pool);
}

// ------------------------------------------------------------------ wake ping-pong + stamps
G = 'wake';
const wakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
const uDecay = uniform(0.99), uSpread = uniform(0.2), uDt = uniform(0.016);
const prevNode = texture(wakeRT[1].texture);
const decayMat = new THREE.MeshBasicNodeMaterial();
{
  const tx = 1 / 2048, u0 = uv();
  const c = prevNode.sample(u0).r;
  const s = prevNode.sample(u0.add(vec2(tx, 0))).r.add(prevNode.sample(u0.sub(vec2(tx, 0))).r).add(prevNode.sample(u0.add(vec2(0, tx))).r).add(prevNode.sample(u0.sub(vec2(0, tx))).r);
  decayMat.colorNode = vec4(mix(c, s.mul(0.25), uSpread).mul(uDecay), 0, 0, 1);
}
const decayQuad = new THREE.QuadMesh(decayMat);
const NH = ST.S.hulls, stA = new Float32Array(NH * 4), stB = new Float32Array(NH * 4);
const stampGeo = new THREE.InstancedBufferGeometry();
stampGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3)); stampGeo.setIndex([0, 2, 1, 0, 3, 2]);
const stAAttr = new THREE.InstancedBufferAttribute(stA, 4).setUsage(THREE.DynamicDrawUsage), stBAttr = new THREE.InstancedBufferAttribute(stB, 4).setUsage(THREE.DynamicDrawUsage);
stampGeo.setAttribute('sA', stAAttr); stampGeo.setAttribute('sB', stBAttr); stampGeo.instanceCount = NH;
const stampMat = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false });
stampMat.fog = false;
{
  const sA = attribute('sA', 'vec4'), sB = attribute('sB', 'vec4');
  const hl = sA.w, hb = sB.x, wl = hl.mul(12);
  const t = positionGeometry.xz.mul(0.5).add(0.5);
  const mov = sB.y.greaterThan(0.5);
  const lo = select(mov, vec2(hl.negate().sub(wl), wl.mul(0.4).add(hb.mul(2)).negate()), vec2(hl.mul(-1.4), hb.mul(-1.9)));
  const hi = select(mov, vec2(hl.mul(1.3), wl.mul(0.4).add(hb.mul(2))), vec2(hl.mul(1.4), hb.mul(1.9)));
  const l = mix(lo, hi, t);
  const c = cos(sA.z), s = sin(sA.z);
  const w = vec2(sA.x.add(l.x.mul(c)).add(l.y.mul(s)), sA.y.sub(l.x.mul(s)).add(l.y.mul(c)));
  // TSL samples render targets top-down on both backends, so world +z maps to clip -y here
  stampMat.vertexNode = vec4(w.x.div(SEA / 2), w.y.negate().div(SEA / 2), 0, 1);
  const vM = varying(l), vS = varying(vec4(hl, hb, sB.y, sB.z));
  stampMat.colorNode = Fn(() => {
    const H = vS.x, B = vS.y;
    const e = length(vec2(vM.x.div(H), vM.y.div(B).mul(0.9)));
    const ring = exp(pow(e.sub(1.05).div(0.18), 2).negate()).mul(0.12);
    const stern = exp(pow(vM.x.add(H.mul(0.95)).div(H.mul(0.28)), 2).add(pow(vM.y.div(B.mul(0.9)), 2)).negate()).mul(2.4);
    const u = H.mul(0.8).sub(vM.x);
    const arm = abs(abs(vM.y).sub(B.mul(0.75).add(u.mul(0.36))));
    const ww = u.mul(0.03).add(0.22);
    const V = exp(arm.mul(arm).div(ww.mul(ww)).negate()).mul(smoothstep(0, 1.2, u)).mul(exp(u.negate().div(H.mul(3.5)))).mul(smoothstep(0, 1, vM.x.sub(H.mul(0.8))).oneMinus());
    const bowSpray = exp(pow(vM.x.sub(H.mul(0.85)).div(H.mul(0.2)), 2).add(pow(vM.y.div(B.mul(1.1)), 2)).negate()).mul(0.6);
    const moving = step(0.5, vS.z);
    const r = mix(ring, ring.mul(1.6).add(stern).mul(vS.w), moving).mul(uDt);
    const g = V.add(bowSpray).mul(vS.w).mul(moving);
    return vec4(r, g, 0, 1);
  })();
}
const stampScene = new THREE.Scene(); { const m = new THREE.Mesh(stampGeo, stampMat); m.frustumCulled = false; stampScene.add(m); }
{
  let o = 0;
  W.CLASSES.forEach((c, ci) => { for (const h of world.perClass[ci]) { h.stampIndex = o; if (!h.moving) { stA.set([h.x, h.z, h.wyaw, c.loa / 2], o * 4); stB.set([c.beam / 2, 0, 0, 0], o * 4); } else { stB.set([c.beam / 2, 1, 1, 0], o * 4); } o++; } });
}
let wakeIdx = 0;
function updateWake(dt) {
  const src = wakeRT[wakeIdx], dst = wakeRT[1 - wakeIdx];
  prevNode.value = src.texture; uDecay.value = Math.exp(-dt / 8.0); uSpread.value = Math.min(1, dt * 18); uDt.value = dt;
  renderer.setRenderTarget(dst);
  decayQuad.render(renderer);
  renderer.autoClear = false; renderer.render(stampScene, wakeCam); renderer.autoClear = true;
  renderer.setRenderTarget(null);
  wakeTexNode.value = dst.texture; wakeIdx = 1 - wakeIdx;
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

// ------------------------------------------------------------------ post: bloom + AgX (renderOutput) + SMAA
G = 'post:';
const pipeline = new THREE.RenderPipeline(renderer);
{
  const scenePass = pass(scene, camera);
  const col = scenePass.getTextureNode('output');
  const bl = bloom(col, 0.45, 0.2, 0.85);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = smaa(renderOutput(col.add(bl)));
}

// ------------------------------------------------------------------ loop
G = 'loop';
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const tOffset = P.t ?? 40;
let last = performance.now(), tStart = performance.now(), firstDone = false, tsPending = false, framesSinceTs = 0;
for (let i = 0; i < 300; i++) { updateMovers(tOffset - 10 + i / 30); updateWake(1 / 30); }

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
  const t = P.still ? tOffset : tOffset + (now - tStart) / 1000;
  uTime.value = t;
  uBeamAngle.value = -(t * 2 * Math.PI / 12.0);
  beam.rotation.y = -uBeamAngle.value;
  updateMovers(t);
  if (!OFF.has('wake')) updateWake(P.still ? 0 : dt);
  if (OFF.has('post')) renderer.render(scene, camera); else pipeline.render();
  ST.cpu(performance.now() - c0);
  ST.S.drawCalls = renderer.info.render.drawCalls; ST.S.triangles = renderer.info.render.triangles;
  framesSinceTs++;
  if (!tsPending) {
    tsPending = true; const n = framesSinceTs; framesSinceTs = 0;
    renderer.resolveTimestampsAsync('render').then((ms) => { if (ms) ST.gpu(ms / n); tsPending = false; }).catch(() => { tsPending = false; });
  }
  if (!firstDone) { firstDone = true; requestAnimationFrame(() => ST.mark('firstFrame')); }
}
let benching = false;
function frame(now) { ST.raf(now); if (!benching) renderStep(now); requestAnimationFrame(frame); }
// Throughput bench: K frames back-to-back, each one synced (readPixels / onSubmittedWorkDone),
// so per-frame time = full CPU+GPU cost of one frame, independent of vsync and of timer queries.
// WebGPURenderer advances its node frame (shadows, bloom, SMAA are FRAME-updated) only in its own rAF loop; mirror it here.
const preStep = () => { renderer._nodes.nodeFrame.update(); renderer.info.frame = renderer._nodes.nodeFrame.frameId; };
const syncGPU = async () => { if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone(); else { const g = renderer.backend.gl, px = new Uint8Array(4); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); } };
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
ST.S.timer = 'renderer timestamp queries (render passes)';
requestAnimationFrame(frame);
