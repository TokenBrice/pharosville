import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * B07 / C04 defined shader arithmetic. GLSL leaves smoothstep(e0, e1, x) undefined when e0 >= e1 and pow(x, y)
 * undefined for x < 0, so a descending ramp or a signed square may read differently across drivers (or NaN).
 * Descending ramps are written 1.0 - smoothstep(lo, hi, x) and squares x * x; no threshold moves.
 */

// GLSL ES 3.00 §8.3: smoothstep as the permissive drivers compute it (also for e0 > e1, which the spec leaves open)
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
// pow as drivers commonly lower it, exp2(y · log2(x)): NaN for a negative base
const powDriver = (x: number, y: number) => 2 ** (y * Math.log2(x));

const SRC = resolve(__dirname, "..");
const read = (path: string) => {
  const source = readFileSync(resolve(SRC, path), "utf8");
  const shaders = path === "world/materials.ts" ? "world/shaders" : path === "ocean/ocean-material.ts" ? "ocean/shaders" : null;
  return shaders ? source + readdirSync(resolve(SRC, shaders)).filter((name) => name.endsWith(".ts")).map((name) => readFileSync(resolve(SRC, shaders, name), "utf8")).join("\n") : source;
};

/** Every GLSL-side call `name(...)` in a module (THREE.MathUtils / Math calls are JavaScript), with its arguments. */
function calls(source: string, name: string): { line: number; args: string[] }[] {
  const out: { line: number; args: string[] }[] = [];
  const re = new RegExp(`(?<![\\w.])${name}\\s*\\(`, "g");
  for (let m = re.exec(source); m; m = re.exec(source)) {
    if (/(MathUtils|Math)\.$/.test(source.slice(Math.max(0, m.index - 12), m.index))) continue;
    const args: string[] = [];
    let depth = 0, cur = "", i = m.index + m[0].length;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") { if (depth === 0) break; depth--; }
      if (c === "," && depth === 0) { args.push(cur.trim()); cur = ""; } else cur += c;
    }
    args.push(cur.trim());
    out.push({ line: source.slice(0, m.index).split("\n").length, args });
  }
  return out;
}

const C04_MODULES = ["ocean/ocean-material.ts", "ocean/wake.ts", "sky/sky-glsl.ts", "world/materials.ts", "weather/rainbow.ts", "weather/precip.ts"];

describe("B07 defined shader arithmetic: reference math", () => {
  const xs = [-12, -3, -1, -0.9, -0.5, -1e-6, 0, 1e-6, 0.1, 0.7, 1.5, 1.6, 2.5, 5, 7, 9.5, 12];

  it("complements an ascending ramp to the descending shape it replaces, at every edge and sign", () => {
    // the sites' former (lo, hi) pairs, written descending: ocean coast trains / swell troughs, the sky's shelf lip
    for (const [hi, lo] of [[9.5, 5.0], [7.0, 1.5], [0.1, -0.9], [2.5, -0.5]]) {
      for (const x of [...xs, lo, hi]) expect(1 - smoothstep(lo, hi, x)).toBeCloseTo(smoothstep(hi, lo, x), 12);
      expect(1 - smoothstep(lo, hi, lo)).toBe(1);
      expect(1 - smoothstep(lo, hi, hi)).toBe(0);
    }
    // expression-valued edges: the kit's light pools (source height p.a, any sign) and the wake's stern sides (hl > 0)
    for (const pa of [-3, 0, 0.4, 4]) for (const y of xs) {
      expect(1 - smoothstep(pa - 0.4, pa + 0.6, y)).toBeCloseTo(smoothstep(pa + 0.6, pa - 0.4, y), 12);
    }
    for (const hl of [0.5, 3, 7]) for (const x of xs.map(Math.abs)) {
      expect(1 - smoothstep(0, hl * 1.05, x)).toBeCloseTo(smoothstep(hl * 1.05, 0, x), 12);
    }
  });

  it("squares a signed value by multiplication: finite where pow(x, 2.0) is undefined", () => {
    for (const x of xs) {
      expect(Number.isFinite(x * x)).toBe(true);
      expect(Math.exp(-x * x)).toBeLessThanOrEqual(1);
      if (x < 0) expect(powDriver(x, 2)).toBeNaN();
      else expect(powDriver(x, 2)).toBeCloseTo(x * x, 9);
    }
    // a gaussian lobe is symmetric about its centre (the rainbow's colour lobes, the wake's rings)
    const lobe = (x: number, c: number, w: number) => { const u = (x - c) / w; return Math.exp(-u * u); };
    for (const d of [0.01, 0.05, 0.2]) expect(lobe(0.3 - d, 0.3, 0.14)).toBeCloseTo(lobe(0.3 + d, 0.3, 0.14), 12);
  });
});

describe("B07 defined shader arithmetic: source guards", () => {
  it("leaves no descending literal smoothstep in the C04 modules", () => {
    for (const path of C04_MODULES) {
      for (const { line, args } of calls(read(path), "smoothstep")) {
        const [e0, e1] = args.map(Number);
        if (Number.isFinite(e0) && Number.isFinite(e1)) expect(e0 < e1, `${path}:${line} smoothstep(${args.join(", ")})`).toBe(true);
      }
    }
  });

  it("writes the expression-valued and literal descending sites as complements", () => {
    const ocean = read("ocean/ocean-material.ts"), wake = read("ocean/wake.ts"), sky = read("sky/sky-glsl.ts"), kit = read("world/materials.ts");
    expect(ocean).toContain("(1.0 - smoothstep(5.0, 9.5, dnC)) * smoothstep(0.7, 1.6, dnC) * (0.45 + 0.55 * (1.0 - smoothstep(1.5, 7.0, dnC)))");
    expect(ocean).toContain("col *= 1.0 - 0.15 * (1.0 - smoothstep(-0.9, 0.1, ch)) * sk;");
    expect(sky).toContain("float lip = (1.0 - smoothstep(-0.5, 2.5, sd)) * smoothstep(-14.0, -4.0, sd)");
    expect(kit).toContain("float below = 1.0 - smoothstep(p.a - 0.4, p.a + 0.6, worldPos.y);");
    expect(kit).not.toContain("smoothstep(p.a + 0.6, p.a - 0.4");
    expect(wake).toContain("(1.0 - smoothstep(0.0, hl * 1.05, abs(q.x)))");
    expect(wake).not.toContain("smoothstep(hl * 1.05, 0.0");
  });

  it("squares by multiplication; the only pow(…, 2.0) left have non-negative bases", () => {
    // sky-glsl: m is a hash in [0, 1); precip: lat is a length over a positive width
    const allowed: Record<string, string[]> = { "sky/sky-glsl.ts": ["m"], "weather/precip.ts": ["lat / w"] };
    for (const path of C04_MODULES) {
      const squares = calls(read(path), "pow").filter(({ args }) => /^2(\.0*)?$/.test(args[1] ?? ""));
      expect(squares.map(({ args }) => args[0]), path).toEqual(allowed[path] ?? []);
    }
    const ocean = read("ocean/ocean-material.ts"), kit = read("world/materials.ts"), rain = read("weather/precip.ts");
    expect(ocean).toContain("float dr = (r - rad) / 0.07;");
    expect(ocean).toContain("exp(-dr * dr)");
    expect(ocean).toContain("float lw = lat / w;");
    expect(ocean).toContain("exp(-lw * lw * 1.4)");
    expect(kit).toContain("float dy = (worldPos.y - p.a) / 2.6;");
    expect(kit).toContain("float band = exp(-dy * dy);");
    expect(rain).toContain("float rd = (d - 0.78) / 0.11;");
    expect(read("weather/rainbow.ts")).toContain("float rbLobe(float x, float c, float w) { float u = (x - c) / w; return exp(-u * u); }");
    expect(read("ocean/wake.ts")).toContain("float stern = exp(-dot(st, st));");
  });
});
