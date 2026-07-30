/**
 * n8ao 2.0.0 ships no TypeScript declarations. This shim covers exactly the
 * surface `src/three/garden-post.ts` consumes: the pmndrs/postprocessing
 * integration pass and its configuration proxy. Keep it in sync with
 * node_modules/n8ao/src/N8AOPostPass.js when the package is upgraded.
 */
declare module "n8ao" {
  import type { Camera, Color, Scene, Texture, WebGLRenderTarget } from "three";
  import { Pass } from "postprocessing";

  export interface N8AOConfiguration {
    aoSamples: number;
    aoRadius: number;
    aoTones: number;
    denoiseSamples: number;
    denoiseRadius: number;
    distanceFalloff: number;
    intensity: number;
    denoiseIterations: number;
    color: Color;
    gammaCorrection: boolean;
    screenSpaceRadius: boolean;
    halfRes: boolean;
    depthAwareUpsampling: boolean;
    colorMultiply: boolean;
    transparencyAware: boolean;
    accumulate: boolean;
    neuralDenoise: boolean;
  }

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    readonly configuration: N8AOConfiguration;
    autoDetectTransparency: boolean;
    lastTime: number;
    beautyRenderTarget: WebGLRenderTarget;
    setDepthTexture: (depthTexture: Texture) => void;
    setDisplayMode: (mode: "Combined" | "AO" | "No AO" | "Split" | "Split AO") => void;
    setQualityMode: (
      mode: "Performance" | "Low" | "Medium" | "High" | "Ultra"
        | "Neural-Low" | "Neural-Medium" | "Neural-High",
    ) => void;
    enableDebugMode: () => void;
    disableDebugMode: () => void;
  }
}
