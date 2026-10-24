import { describe, expect, it } from "vitest";
import { buildBolt, jagged } from "./lightning";
import {
  FRONT_MIN, FRONT_SEC, moonbowLight, RAINBOW_SEC, recoveryLine, seasonForMonth, stormTrend, showerEnvelope, snowShare, targetsForLevel, WeatherDirector, weightsForSeason, type DirectorInput,
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
    // (a four-band drop crosses as a clearing line: the rain stops once it has passed overhead)
    run(d, 90, input(0, "CALM"));
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

describe("W01 weather fronts", () => {
  it("never on load; a big enough change sends a front, a small one eases in place", () => {
    const d = new WeatherDirector();
    d.step(0.1, input(3, "WARNING"));
    expect(d.state.front).toBeNull();
    run(d, 5, input(3 + FRONT_MIN * 0.8, "WARNING"));
    expect(d.state.front).toBeNull();
    const e = new WeatherDirector();
    e.step(0.1, input(1, "WATCH"));
    e.step(0.1, input(2, "ALERT"));
    expect(e.state.front).not.toBeNull();
    expect(e.state.front!.to).toBe(2);
  });

  it("the local weather turns only as the front passes overhead, and the front then clears away", () => {
    const d = new WeatherDirector();
    d.step(0.1, input(1, "WATCH"));
    run(d, FRONT_SEC * 0.2, input(3, "WARNING"));
    expect(d.state.level).toBeCloseTo(1, 5);            // still out over the sea
    run(d, FRONT_SEC * 0.4, input(3, "WARNING"));
    expect(d.state.level!).toBeGreaterThan(2);
    run(d, FRONT_SEC * 0.5, input(3, "WARNING"));
    expect(d.state.front).toBeNull();
    expect(d.state.level).toBe(3);
  });

  it("reduced motion: no sweep, the weather eases in place", () => {
    const d = new WeatherDirector();
    d.step(0.1, input(0, "CALM"));
    d.step(0.1, input(3, "WARNING", { still: true }));
    expect(d.state.front).toBeNull();
  });

  it("the trend line says the same thing as the front", () => {
    expect(stormTrend(null)).toBeNull();
    expect(stormTrend({ from: 1, to: 2.1, progress: 0.3 })?.text).toBe("rising toward Alert");
    expect(stormTrend({ from: 3.4, to: 1, progress: 0.5 })?.text).toBe("easing toward Watch");
    expect(stormTrend({ from: 1, to: 2, progress: 1 })).toBeNull();
    expect(stormTrend({ from: 1, to: 1 + FRONT_MIN * 0.9, progress: 0.2 })).toBeNull();
    const d = new WeatherDirector();
    d.step(0.1, input(1, "WATCH"));
    d.step(0.1, input(2, "ALERT"));
    expect(stormTrend(d.state.front)?.dir).toBe("rising");
  });

  it("records the recovery it saw, with the band it left", () => {
    const d = new WeatherDirector();
    d.step(0.1, input(3, "WARNING"));
    d.step(0.1, input(1, "WATCH", { time: 42 }));
    expect(d.state.recovery).toEqual({ fromBand: "WARNING", atSec: 42 });
  });
});

describe("W03 sunbreaks and W09 squalls", () => {
  it("breaks open as the rain eases and after a recovery, never under Danger's deck", () => {
    const d = new WeatherDirector();
    d.step(0.1, input(4, "DANGER", { still: true }));
    run(d, 120, input(4, "DANGER", { still: true }));
    expect(d.state.breaks).toBeLessThan(0.01);
    run(d, 60, input(1, "WATCH", { still: true }));
    expect(d.state.breaks).toBeGreaterThan(0.5);
    const c = new WeatherDirector();
    run(c, 120, input(0, "CALM"));
    expect(c.state.breaks).toBe(0);
  });

  it("squalls only at Watch and Alert, overhead at the shower's crest", () => {
    const k = (l: number) => { const d = new WeatherDirector(); d.step(0.1, input(l, null)); d.step(0.1, input(l, null)); return d.state.squall.k; };
    expect(k(0)).toBe(0);
    expect(k(1)).toBeGreaterThan(0.4);
    expect(k(2)).toBeGreaterThan(0.9);
    expect(k(3.5)).toBe(0);
    const d = new WeatherDirector();
    d.step(0.1, input(2, "ALERT"));
    for (let t = 0; t < 400; t += 0.5) {
      d.step(0.5, input(2, "ALERT", { time: t }));
      const env = showerEnvelope(t, targetsForLevel(2).showerOn);
      expect(Math.abs(d.state.squall.pos - 1)).toBeCloseTo(1 - env, 5);
    }
  });
});

describe("W07 moonbow and the recovery line", () => {
  it("a night recovery hangs a moonbow only under a bright moon", () => {
    expect(moonbowLight(0.1, 1)).toBe(0);
    expect(moonbowLight(0.9, 1)).toBe(1);
    expect(moonbowLight(0.9, 0)).toBe(0);
    const d = new WeatherDirector();
    run(d, 2, input(3, "WARNING", { sunUp: 0, moonUp: 1, still: true }));
    run(d, 150, input(0, "CALM", { sunUp: 0, moonUp: 1, still: true }));
    expect(d.state.rainbow).toBeGreaterThan(0.5);
  });

  it("says when and from what it recovered, for as long as the bow may hang", () => {
    expect(recoveryLine(null, 10)).toBeNull();
    expect(recoveryLine({ fromBand: "ALERT", atSec: 100 }, 120)).toBe("Recovered from Alert just now");
    expect(recoveryLine({ fromBand: "WARNING", atSec: 100 }, 100 + 185)).toBe("Recovered from Warning 3 min ago");
    expect(recoveryLine({ fromBand: "ALERT", atSec: 100 }, 101 + RAINBOW_SEC)).toBeNull();
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
