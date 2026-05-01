export type StructuralHashPath = readonly (string | number)[];
export type StructuralArrayOrder = "ordered" | "unordered";

export interface StructuralHashOptions {
  arrayOrder?: StructuralArrayOrder | ((input: {
    path: StructuralHashPath;
    value: readonly unknown[];
  }) => StructuralArrayOrder);
}

const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;

function nextArrayOrder(
  options: StructuralHashOptions | undefined,
  path: StructuralHashPath,
  value: readonly unknown[],
): StructuralArrayOrder {
  const configured = options?.arrayOrder;
  if (!configured) return "ordered";
  if (typeof configured === "function") return configured({ path, value });
  return configured;
}

function hashFNV64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let hash = FNV64_OFFSET_BASIS;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV64_PRIME) & FNV64_MASK;
  }

  return hash.toString(16).padStart(16, "0");
}

function serializeStructuralValue(
  value: unknown,
  options: StructuralHashOptions | undefined,
  path: StructuralHashPath,
  recursionStack: WeakSet<object>,
): string {
  if (value === null) return "null";

  if (typeof value === "string") return `s:${JSON.stringify(value)}`;
  if (typeof value === "boolean") return value ? "b:1" : "b:0";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "n:NaN";
    if (value === Number.POSITIVE_INFINITY) return "n:+Inf";
    if (value === Number.NEGATIVE_INFINITY) return "n:-Inf";
    if (Object.is(value, -0)) return "n:-0";
    return `n:${value}`;
  }
  if (typeof value === "bigint") return `bi:${value.toString()}`;
  if (typeof value === "undefined") return "u";
  if (typeof value === "symbol") return `sym:${String(value.description ?? "")}`;
  if (typeof value === "function") return `fn:${value.name || "anonymous"}`;

  const objectValue = value as object;
  if (recursionStack.has(objectValue)) {
    return "ref:circular";
  }

  recursionStack.add(objectValue);
  try {
    if (value instanceof Date) return `date:${Number.isFinite(value.getTime()) ? value.toISOString() : "invalid"}`;
    if (value instanceof RegExp) return `re:${value.toString()}`;

    if (Array.isArray(value)) {
      const arrayOrder = nextArrayOrder(options, path, value);
      const entries = value.map((entry, index) => serializeStructuralValue(
        entry,
        options,
        [...path, arrayOrder === "unordered" ? "<item>" : index],
        recursionStack,
      ));

      if (arrayOrder === "unordered") {
        entries.sort();
      }

      return `[${entries.join(",")}]`;
    }

    if (value instanceof Set) {
      const entries = Array.from(value, (entry) => serializeStructuralValue(
        entry,
        options,
        [...path, "<set>"],
        recursionStack,
      )).sort();
      return `set:[${entries.join(",")}]`;
    }

    if (value instanceof Map) {
      const entries = Array.from(value, ([entryKey, entryValue]) => {
        const serializedKey = serializeStructuralValue(entryKey, options, [...path, "<map-key>"], recursionStack);
        const serializedValue = serializeStructuralValue(entryValue, options, [...path, "<map-value>"], recursionStack);
        return `${serializedKey}=>${serializedValue}`;
      }).sort();
      return `map:[${entries.join(",")}]`;
    }

    if (ArrayBuffer.isView(value)) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return `ta:${value.constructor.name}:${Array.from(bytes).join(",")}`;
    }

    if (value instanceof ArrayBuffer) {
      return `ab:${Array.from(new Uint8Array(value)).join(",")}`;
    }

    const members = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => {
        const serialized = serializeStructuralValue(
          (value as Record<string, unknown>)[key],
          options,
          [...path, key],
          recursionStack,
        );
        return `${JSON.stringify(key)}:${serialized}`;
      });

    return `{${members.join(",")}}`;
  } finally {
    recursionStack.delete(objectValue);
  }
}

export function structuralSerialize(value: unknown, options?: StructuralHashOptions): string {
  return serializeStructuralValue(value, options, [], new WeakSet<object>());
}

export function structuralFingerprint(value: unknown, options?: StructuralHashOptions): string {
  return hashFNV64(structuralSerialize(value, options));
}
