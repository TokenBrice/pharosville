import { describe, expect, it } from "vitest";
import { buildBolt, jagged } from "./lightning";
import {
  RAINBOW_SEC, seasonForMonth, showerEnvelope, snowShare, targetsForLevel, WeatherDirector, weightsForSeason, type DirectorInput,
} from "./director";

const input = (level: number | null, band: DirectorInput["band"], extra: Partial<DirectorInput> = {}): DirectorInput =>
  ({ level, band, snowShare: 0, sunUp: 1, time: 0, ...extra });

/** Step the director for `sec` seconds in 0.1 s frames. */
function run(d: WeatherDirector, sec: number, inp: DirectorInput): void {
  for (let t = 0; t < sec; t += 0.1) d.step(0.1, { ...inp, time: inp.time + t });
}

describe("weather grammar: storminess is data", () => {
  it("calm is fair and dry; storminess rises monotonically with the band", () => {
    const calm = targetsForLevel(0);
    expect(calm.steady + calm.shower).toBe(0);
    expect(calm.strikesPerMin).toBe(0);
    let prev = targetsForLevel(0);
    for (let l = 0.5; l <= 4; l += 0.5) {
      const t = targetsForLevel(l);
      expect(t.cloud).toBeGreaterThanOrEqual(prev.cloud);
      expect(t.wind).toBeGreaterThanOrEqual(prev.wind);
      expect(t.steady).toBeGreaterThanOrEqual(prev.steady);
      expect(t.strikesPerMin).toBeGreaterThanOrEqual(prev.strikesPerMin);
      prev = t;
    }
  });

  it("watch is at most a brief drizzle; alert showers; lightning only from warning", () => {
    const w = targetsForLevel(1);
    expect(w.steady).toBe(0);
    expect(w.shower).toBeLessThan(0.2);
    expect(targetsForLevel(2).strikesPerMin).toBe(0);
    expect(targetsForLevel(3).strikesPerMin).toBeGreaterThan(0);
    expect(targetsForLevel(4).steady).toBe(1);
    // a Watch shower cell rains only briefly (well under half the cycle)
    let wet = 0;
    for (let t = 0; t < 600; t += 1) if (showerEnvelope(t, w.showerOn) > 0.05) wet++;
    expect(wet / 600).toBeLessThan(0.3);
  });

  it("the deck and wind follow the model's own law", () => {
    expect(targetsForLevel(2).cloud).toBeCloseTo(0.15 + 2 * 0.22);
    expect(targetsForLevel(3).wind).toBeCloseTo(0.8);
  });

  it("snaps to the first reading, then eases (no popping) and lingers", () => {
    const d = new WeatherDirector();
    d.step(0.1, input(4, "DANGER"));
    expect(d.state.precip).toBeCloseTo(1);
    expect(d.state.cloud).toBeCloseTo(1);
    // the band clears: one frame later the rain is still there, a minute later mostly gone
    d.step(0.1, input(0, "CALM"));
    expect(d.state.precip).toBeGreaterThan(0.95);
    run(d, 60, input(0, "CALM"));
    expect(d.state.precip).toBeLessThan(0.45);
    run(d, 240, input(0, "CALM"));
    expect(d.state.precip).toBeLessThan(0.01);
    // the ground dries slowly after the rain
    expect(d.state.wetness).toBeGreaterThan(0.05);
  });

  it("unknown holds the weather, never paints it calm", () => {
    const d = new WeatherDirector();
    d.step(0.1, input(3, "WARNING"));
    const p = d.state.precip;
    run(d, 30, input(null, null));
    expect(d.state.precip).toBeGreaterThan(p * 0.5);
    expect(d.state.level).toBe(3);
  });

  it("snow vs rain is the season's; the intensity is the band's", () => {
    expect(snowShare(weightsForSeason("winter"))).toBe(1);
    expect(snowShare(weightsForSeason("summer"))).toBe(0);
    const d = new WeatherDirector();
    d.step(0.1, input(4, "DANGER", { snowShare: 1 }));
    expect(d.state.snow).toBeCloseTo(1);
    expect(d.state.rain).toBeCloseTo(0);
    // snow lies, it does not wet
    run(d, 30, input(4, "DANGER", { snowShare: 1 }));
    expect(d.state.wetness).toBeLessThan(0.2);
  });

  it("a recovery from Alert+ to Watch- hangs a rainbow by day, never on load, never at night", () => {
    const d = new WeatherDirector();
    run(d, 1, input(0, "CALM"));
    expect(d.rainbowRemaining).toBe(0);
    run(d, 5, input(3, "WARNING"));
    d.step(0.1, input(1, "WATCH"));
    expect(d.rainbowRemaining).toBeCloseTo(RAINBOW_SEC, 0);
    run(d, 120, input(1, "WATCH", { time: 10 }));
    expect(d.state.rainbow).toBeGreaterThan(0.5);
    const n = new WeatherDirector();
    run(n, 2, input(3, "WARNING", { sunUp: 0 }));
    run(n, 120, input(0, "CALM", { sunUp: 0 }));
    expect(n.state.rainbow).toBe(0);
    // first load straight into calm: nothing to recover from
    const f = new WeatherDirector();
    run(f, 60, input(0, "CALM"));
    expect(f.state.rainbow).toBe(0);
  });
});

describe("calendar fallback", () => {
  it("months map to seasons, flipped south of the equator", () => {
    expect(seasonForMonth(1, false)).toBe("winter");
    expect(seasonForMonth(4, false)).toBe("spring");
    expect(seasonForMonth(7, false)).toBe("summer");
    expect(seasonForMonth(10, false)).toBe("autumn");
    expect(seasonForMonth(1, true)).toBe("summer");
    expect(seasonForMonth(7, true)).toBe("winter");
  });
});

describe("lightning bolts", () => {
  it("are deterministic polylines from the cloud base to the horizon with forks", () => {
    let s = 1;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const bolts = buildBolt(0, 3, 4, R);
    expect(bolts.length).toBeGreaterThanOrEqual(3);
    const main = bolts[0].pts;
    expect(main[0][1]).toBe(4);
    expect(main[main.length - 1][1]).toBeLessThan(0.1);
    expect(jagged([0, 1], [0, 0], 0.3, 3, R)).toHaveLength(9);
  });
});
