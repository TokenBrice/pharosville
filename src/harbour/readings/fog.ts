import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute, EffectPass, type EffectComposer } from "postprocessing";

/**
 * STALE FOG: sea fog that rolls in ONLY when the fleet's data (/api/stablecoins) is stale or
 * unavailable (research/04 §3 "Freshness", §8.2). Never decoration.
 *
 * A depth-aware post effect (scene-linear, before bloom / AgX) integrating an exponential height fog
 * along each view ray: thick on the water, thinning up the hill so the town and the Pharos stand
 * out of the bank, drifting in noise patches. Bright lamps keep part of their HDR excess, so the
 * harbour lights glow through the murk. The pass is disabled at zero.
 */
const FRAG = /* glsl */ `
uniform float uAmount;
uniform vec3 uFogCol;
uniform mat4 uCamWorld;
uniform mat4 uInvProj;
uniform float uTime;
uniform sampler2D uNoise;
const float H = 24.0;          // scale height of the bank (m)
const float A = 0.028;         // density at the sea surface (1/m)
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  vec4 ray = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 vp = ray.xyz / ray.w;
  vp *= viewZ / vp.z;
  vec3 cp = uCamWorld[3].xyz;
  vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
  float L = length(wp - cp);
  float dy = wp.y - cp.y;
  float e0 = exp(-max(cp.y, 0.0) / H), e1 = exp(-max(wp.y, 0.0) / H);
  float od = abs(dy) > 0.5 ? A * L * H * (e1 - e0) / -dy : A * L * e0;
  // drifting banks: two octaves of the shared fbm at the hit point, moving with the onshore breeze
  vec2 q = wp.xz + vec2(uTime * 2.2, uTime * 0.9);
  float n = texture2D(uNoise, q * 0.0019).r * 0.65 + texture2D(uNoise, q * 0.0071 + 0.37).g * 0.45;
  od *= 0.45 + 1.0 * smoothstep(0.25, 0.85, n);
  // a veil, never a wall: the harbour stays legible through the thickest bank
  float f = min(1.0 - exp(-od), 0.8) * uAmount;
  vec3 col = mix(inputColor.rgb, uFogCol, f);
  // lamps, windows and the beam keep part of their HDR excess: lights glow through fog
  col += max(inputColor.rgb - 0.9, 0.0) * f * 0.55;
  outputColor = vec4(col, inputColor.a);
}`;

export class StaleFogEffect extends Effect {
  constructor(noise: THREE.Texture, time: THREE.IUniform<number>) {
    super("StaleFogEffect", FRAG, {
      blendFunction: BlendFunction.SET,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ["uAmount", new THREE.Uniform(0)],
        ["uFogCol", new THREE.Uniform(new THREE.Color())],
        ["uCamWorld", new THREE.Uniform(new THREE.Matrix4())],
        ["uInvProj", new THREE.Uniform(new THREE.Matrix4())],
        ["uTime", time as THREE.Uniform],
        ["uNoise", new THREE.Uniform(noise)],
      ]),
    });
  }
}

const LUM = new THREE.Vector3(0.2126, 0.7152, 0.0722);

export class StaleFog {
  private readonly effect: StaleFogEffect;
  private pass: EffectPass | null;
  private readonly grey = new THREE.Color();
  amount = 0;

  constructor(private readonly composer: EffectComposer, private readonly camera: THREE.PerspectiveCamera,
    noise: THREE.Texture, time: THREE.IUniform<number>) {
    // Inserted at init, before the first composer.render: adding a depth pass to a running pmndrs
    // composer (it re-creates its buffers with a depth attachment) blacked the frame. Disabled until
    // the fleet data goes stale, so a healthy harbour only pays the composer's depth blit.
    this.effect = new StaleFogEffect(noise, time);
    this.pass = new EffectPass(camera, this.effect);
    this.pass.enabled = false;
    composer.addPass(this.pass, 1); // right after the RenderPass: scene-linear, before bloom/AgX
  }

  /** amount 0..1 (already faded by the caller); haze = the time-of-day haze colour (linear). */
  update(amount: number, haze: THREE.Color, horizon: THREE.Color, night: number): void {
    this.amount = amount;
    if (!this.pass) return;
    this.pass.enabled = amount > 0.001;
    if (!this.pass.enabled) return;
    const u = this.effect.uniforms;
    u.get("uAmount")!.value = amount;
    (u.get("uCamWorld")!.value as THREE.Matrix4).copy(this.camera.matrixWorld);
    (u.get("uInvProj")!.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
    // mist: the hour's haze, a touch of horizon light, half desaturated (fog is grey, not tinted glass)
    const c = u.get("uFogCol")!.value as THREE.Color;
    // by night the bank is moonlit and lamp-lit: paler than the dark scene it veils, so it still reads
    c.copy(haze).lerp(horizon, 0.25 + 0.45 * night);
    const l = c.r * LUM.x + c.g * LUM.y + c.b * LUM.z;
    c.lerp(this.grey.setRGB(l, l, l), 0.45 - 0.15 * night).multiplyScalar(1.05 + 1.3 * night);
  }

  dispose(): void {
    if (this.pass) { this.composer.removePass(this.pass); this.pass.dispose(); }
    this.pass = null;
  }
}
