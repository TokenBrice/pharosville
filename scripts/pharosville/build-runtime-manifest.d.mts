// NFS4 #15: type stub so vite.config.ts can import the runtime-manifest helper.
import type { PharosVilleAssetManifest } from "../../src/systems/asset-manifest";

export function stripAuthoringFields(manifest: PharosVilleAssetManifest): PharosVilleAssetManifest;

export function buildRuntimeManifest(sourcePath: string): PharosVilleAssetManifest;

export function writeRuntimeManifest(sourcePath: string, runtimePath: string): PharosVilleAssetManifest;
