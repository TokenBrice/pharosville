import * as THREE from "three";

/**
 * The recovery rainbow: when the DEWS weather improves from ≥ Alert to ≤ Watch during a visit, a bow
 * hangs over the harbour for a few minutes (daylight only). Physically inspired, art-directed in size:
 *
 *  - centred opposite the sun (the antisolar side of the view), seen through the thinning rain;
 *  - primary bow red outside → violet inside, with two or three faint supernumerary bands inside the violet;
 *  - the brighter sky inside the bow, Alexander's dark band between the bows, and a fainter secondary bow
 *    with the colours reversed;
 *  - the bow's legs fade where the rain curtain ends.
 *
 * A rainbow is light from drops anywhere along the line of sight, so it overlays distant land as well as
 * sky. It is fixed in angle relative to the viewer (a pan, a translation, leaves it in place, as in life).
 * But the drops that make it hang BEYOND the harbour: the Pharos, the chimneys and the near town stand in front
 * of the bow. With no depth texture to read, the bow is laid as a few depth-tested sheets spread over a range of
 * view depths (each carrying a share of the light): geometry nearer than the range hides it, geometry inside it
 * hides part of it (a soft depth fade), the far sea and land past it keep it whole.
 * One screen-covering instanced draw (premultiplied: adds light, the dark band subtracts a little), only while shown.
 */
const LAYERS = 4;

const VERT = /* glsl */ `
attribute float aLayer;      // 0..1 across the sheets, near to far
uniform vec2 uDepth;         // view depth (m) of the nearest and the farthest sheet
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  vec4 c = projectionMatrix * vec4(0.0, 0.0, -mix(uDepth.x, uDepth.y, aLayer), 1.0);
  gl_Position = vec4(position.xy, c.z / c.w, 1.0);
}`;

const FRAG = /* glsl */ `
uniform mat4 uInvProjView;
uniform vec3 uCamPos;
uniform vec3 uBowDir;      // world direction of the bow centre
uniform float uRadius;     // bow radius (deg)
uniform float uK;          // strength 0..1
uniform vec3 uSunCol;
uniform float uSilver;     // W07 moonbow: 1 = mostly white-silver
varying vec2 vNdc;
vec3 spectrum(float x) {
  // x 0 = red (outside) … 1 = violet (inside); soft overlapping lobes, as the drops' disc smears them
  vec3 c = vec3(0.0);
  c += vec3(1.0, 0.16, 0.10) * exp(-pow((x - 0.08) / 0.17, 2.0));
  c += vec3(1.0, 0.62, 0.10) * exp(-pow((x - 0.30) / 0.14, 2.0));
  c += vec3(0.55, 0.95, 0.25) * exp(-pow((x - 0.50) / 0.14, 2.0));
  c += vec3(0.12, 0.55, 1.0) * exp(-pow((x - 0.72) / 0.15, 2.0));
  c += vec3(0.45, 0.22, 0.95) * exp(-pow((x - 0.92) / 0.14, 2.0));
  return c;
}
void main() {
  vec4 w = uInvProjView * vec4(vNdc, 1.0, 1.0);
  vec3 ray = normalize(w.xyz / w.w - uCamPos);
  float ang = degrees(acos(clamp(dot(ray, uBowDir), -1.0, 1.0)));
  float r = ang / uRadius;                 // 1 = the primary's red edge
  float bw = 0.085;                        // primary width (relative): ~1.8° of 42°
  // primary: red outside (r = 1) to violet inside (r = 1 - bw)
  float xp = (1.0 - r) / bw;
  vec3 col = spectrum(xp) * smoothstep(-0.25, 0.05, xp) * (1.0 - smoothstep(0.95, 1.3, xp));
  // supernumeraries: faint pink-green fringes inside the violet, fading inward
  float xs = (1.0 - bw - r) / (bw * 0.55);
  float sup = max(0.0, xs) < 3.2 ? 0.5 + 0.5 * cos(xs * 6.2831) : 0.0;
  col += mix(vec3(0.55, 0.9, 0.45), vec3(0.85, 0.45, 0.75), 0.5 + 0.5 * cos(xs * 3.1416)) * sup * 0.22 * smoothstep(0.0, 0.25, xs) * exp(-xs * 0.7);
  // the sky inside the bow is brighter
  float inside = (1.0 - smoothstep(1.0 - bw * 1.2, 1.0 - bw * 0.6, r)) * smoothstep(0.35, 0.95, r);
  col += vec3(0.85, 0.88, 0.9) * inside * 0.07;
  // secondary bow (reversed: red inside) at ~1.21 r, wider and fainter
  float r2 = 1.21;
  float xs2 = (r - r2) / (bw * 1.8);
  col += spectrum(xs2) * smoothstep(-0.25, 0.05, xs2) * (1.0 - smoothstep(0.95, 1.3, xs2)) * 0.32;
  // Alexander's dark band between the bows
  float dark = smoothstep(1.0, 1.04, r) * (1.0 - smoothstep(r2 - 0.04, r2, r));
  // the legs fade toward the ground: strongest overhead
  float up = dot(normalize(ray - uBowDir * dot(ray, uBowDir)), vec3(0.0, 1.0, 0.0));
  // the legs fade toward the ground and the near foreground: strongest overhead, over the far water and sky
  float legs = smoothstep(0.05, 0.75, up) * smoothstep(-0.75, 0.2, vNdc.y);
  float k = uK * legs / ${LAYERS}.0;
  col = mix(col, vec3(dot(col, vec3(0.3, 0.4, 0.3))) * vec3(0.92, 0.97, 1.08), uSilver * 0.82);
  vec3 light = col * mix(vec3(1.0), uSunCol / max(max(uSunCol.r, uSunCol.g), 1e-3), 0.35) * 0.46 * k;
  float alpha = dark * 0.09 * k;
  if (dot(light, vec3(1.0)) < 0.0015 / ${LAYERS}.0 && alpha < 0.002 / ${LAYERS}.0) discard;
  gl_FragColor = vec4(light, alpha);
}`;

export class Rainbow {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly fwd = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();

  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    g.setAttribute("aLayer", new THREE.InstancedBufferAttribute(Float32Array.from({ length: LAYERS }, (_, i) => i / (LAYERS - 1)), 1));
    g.instanceCount = LAYERS;
    this.mat = new THREE.ShaderMaterial({
      name: "hb_weather_rainbow", vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uInvProjView: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
        uBowDir: { value: new THREE.Vector3(0, 0, -1) }, uRadius: { value: 18 }, uK: { value: 0 },
        uSunCol: { value: new THREE.Color(1, 1, 1) }, uDepth: { value: new THREE.Vector2(800, 1100) }, uSilver: { value: 0 },
      },
      transparent: true, depthTest: true, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 90;
    this.mesh.name = "weather-rainbow";
    this.mesh.visible = false;
  }

  /**
   * strength 0..1; sunDir = direction TO the sun. The bow centre sits on the antisolar side of the view,
   * sized to the frame (a 42° bow would not fit a 25° lens), its crown near the top of the frame.
   * `distance` = the rig's distance to its target; `horizon` = the painted sky card's distance (the sheets stay in front of it).
   */
  update(strength: number, camera: THREE.PerspectiveCamera, sunDir: THREE.Vector3, sunCol: THREE.Color, distance: number, horizon: number, moonbow = 0): void {
    this.mesh.visible = strength > 0.003;
    if (!this.mesh.visible) return;
    const u = this.mat.uniforms;
    // W07: by night the bow hangs opposite the moon (the key light), silver and at about a quarter strength
    u.uSilver.value = moonbow;
    strength *= 1 - 0.75 * moonbow;
    // the rain curtain: just past the harbour's heart (the Pharos stands ~1.1 × the rig distance away) out to the far shore
    const far = Math.min(distance * 1.45, horizon * 0.85);
    u.uDepth.value.set(Math.min(distance * 1.16, far * 0.8), far);
    u.uK.value = strength;
    u.uSunCol.value.copy(sunCol);
    camera.updateMatrixWorld();
    u.uCamPos.value.copy(camera.position);
    u.uInvProjView.value.copy(this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert());
    const fwd = camera.getWorldDirection(this.fwd);
    const fwdAz = Math.atan2(fwd.x, -fwd.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));          // negative looking down
    const vfov = camera.fov;
    const radius = vfov * 0.78;
    // antisolar side: the bow leans away from the sun's side of the view
    let rel = Math.atan2(sunDir.x, -sunDir.z) - fwdAz;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const side = -Math.sign(Math.sin(rel) || 1) * Math.min(1, Math.abs(Math.sin(rel)));
    const az = fwdAz + THREE.MathUtils.degToRad(side * vfov * 0.25);
    // crown at ~12% below the frame top
    const crown = THREE.MathUtils.radToDeg(pitch) + vfov / 2 - vfov * 0.12;
    const el = THREE.MathUtils.degToRad(crown - radius);
    u.uBowDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    u.uRadius.value = radius;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
