import logos from "../../data/logos.json";
import lossless from "../../public/logos/lossless.json";

const runtimePaths: Record<string, string> = lossless;

/** Original paths remain the build-source contract; runtime alternates are exact RGBA. */
export function runtimeLogoPath(path: string): string {
  return runtimePaths[path] ?? path;
}

export const logosById: Record<string, string> = Object.fromEntries(
  Object.entries(logos).map(([id, path]) => [id, runtimeLogoPath(path)]),
);
