export class ShaderPatchError extends Error {
  constructor(id: string, expected: number, actual: number) {
    super(`[harbour] shader patch ${id}: expected ${expected} anchor(s), found ${actual}`);
    this.name = "ShaderPatchError";
  }
}

/** Fail at composition time when a Three upgrade or an earlier patch changes an owned anchor. */
export function patch(source: string, anchor: string | RegExp, replacement: string, { id, count = 1 }: { id: string; count?: number }): string {
  const matches = typeof anchor === "string" ? source.split(anchor).length - 1
    : [...source.matchAll(new RegExp(anchor.source, anchor.flags.includes("g") ? anchor.flags : `${anchor.flags}g`))].length;
  if (matches !== count) throw new ShaderPatchError(id, count, matches);
  return source.replaceAll(typeof anchor === "string" ? anchor : new RegExp(anchor.source, anchor.flags.includes("g") ? anchor.flags : `${anchor.flags}g`), replacement);
}
