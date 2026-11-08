import type * as THREE from "three";
import { BootFailure } from "./failure";

const failures = new WeakMap<THREE.WebGLRenderer, Error>();
const listeners = new WeakMap<THREE.WebGLRenderer, Set<(error: Error) => void>>();

/** Install before any system can compile; recovery UI subscribes without receiving shader source. */
export function installShaderFailureHook(renderer: THREE.WebGLRenderer): () => void {
  if (!renderer.debug) return () => {};
  const previous = renderer.debug.onShaderError;
  const failed: NonNullable<typeof previous> = (...args) => {
    if (!failures.has(renderer)) {
      const error = new BootFailure("shader", undefined, "The harbour shader could not link");
      failures.set(renderer, error);
      for (const listener of listeners.get(renderer) ?? []) listener(error);
    }
    previous?.(...args);
  };
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = failed;
  return () => { if (renderer.debug.onShaderError === failed) renderer.debug.onShaderError = previous; };
}

export function onShaderFailure(renderer: THREE.WebGLRenderer, listener: (error: Error) => void): () => void {
  let set = listeners.get(renderer);
  if (!set) { set = new Set(); listeners.set(renderer, set); }
  set.add(listener);
  const error = failures.get(renderer);
  if (error) listener(error);
  return () => { set.delete(listener); };
}

export function assertShaderReady(renderer: THREE.WebGLRenderer): void {
  const error = failures.get(renderer);
  if (error) throw error;
}
