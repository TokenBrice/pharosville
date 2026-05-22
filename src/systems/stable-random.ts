export function stableHash(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function stableFnv1aHash(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stableUnit(id: string): number {
  return stableHash(id) / 0xffffffff;
}

export function stableOffset(id: string, span: number): number {
  return (stableHash(id) % (span * 2 + 1)) - span;
}
