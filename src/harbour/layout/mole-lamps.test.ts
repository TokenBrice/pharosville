import { describe, expect, it } from "vitest";
import layoutJson from "../data/layout.json";
import type { HarbourLayout, Vec2 } from "./types";

const layout = layoutJson as unknown as HarbourLayout;
const lights = layout.lights ?? [];

/** The two marina moles' crest lines, chained from pier-ethereum's 'mole' segments (the round heads excluded). */
function moleLines(): Vec2[][] {
  const lines: Vec2[][] = [];
  for (const s of layout.piers.find((p) => p.id === "pier-ethereum")!.segments) {
    if (s.kind !== "mole" || s.width > 15) continue;
    const last = lines.at(-1);
    if (last && last.at(-1)![0] === s.a[0] && last.at(-1)![1] === s.a[1]) last.push(s.b);
    else lines.push([s.a, s.b]);
  }
  return lines;
}

/** Arc length along `line` of the nearest point to p, and the distance to it (x/z plane). */
function along(line: Vec2[], p: Vec2): { s: number; d: number } {
  let best = { s: 0, d: Infinity }, s0 = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const t = len ? Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - az) * dz) / (len * len))) : 0;
    const d = Math.hypot(p[0] - ax - t * dx, p[1] - az - t * dz);
    if (d < best.d) best = { s: s0 + t * len, d };
    s0 += len;
  }
  return best;
}

describe("E09 the moles' crest lamps light places, not a metronome", () => {
  const lines = moleLines();
  const lamps = lights.filter((l) => l.kind === "lamp").map((l) => [l.position[0], l.position[2]] as Vec2);
  const crest = lines.map((line) => lamps.map((p) => along(line, p)).filter((a) => a.d < 2.5).map((a) => a.s).sort((a, b) => a - b));

  it("keeps two thirds of the 24 m stations (21 -> 14) on the two moles", () => {
    expect(lines).toHaveLength(2);
    expect(crest.map((c) => c.length).sort()).toEqual([6, 8]);
  });

  it("groups them (no lamp stands alone) with dark stretches of 48 m and more between the groups", () => {
    for (const c of crest) {
      const gaps = c.slice(1).map((s, i) => s - c[i]);
      for (let i = 0; i < c.length; i++) {
        const near = Math.min(i > 0 ? gaps[i - 1] : Infinity, i < gaps.length ? gaps[i] : Infinity);
        expect(near).toBeLessThan(26);                              // every lamp has a neighbour one station away
      }
      expect(gaps.filter((g) => g > 46)).toHaveLength(2);           // root | exedra | head
    }
  });

  it("keeps every navigation light: the four harbour lights and a pierhead lamp on each mole head", () => {
    expect(lights.filter((l) => l.kind === "harbourlight")).toHaveLength(4);
    for (const line of lines) {
      const head = line.at(-1)!;
      expect(lights.some((l) => l.kind === "pierhead" && Math.hypot(l.position[0] - head[0], l.position[2] - head[1]) < 12)).toBe(true);
    }
  });
});
