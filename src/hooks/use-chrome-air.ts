import { useEffect } from "react";
import { CHROME_AIR_TOKEN_NAMES, chromeAirTokens } from "../systems/chrome-air";
import { dayCycleBeats } from "../systems/day-cycle-beats";

/**
 * W6.5: writes the chrome's colour roles to `:root` from the light score.
 * Pass a minute-quantised hour: the write happens once a minute, with no CSS
 * transition on the inherited tokens (a transition on `:root` variables would
 * restyle the whole DOM every frame), and a minute's step of a smoothly mixed
 * colour is below perception. Reduced motion needs nothing different.
 */
export function useChromeAir(minuteHour: number): void {
  useEffect(() => {
    const style = document.documentElement.style;
    const tokens = chromeAirTokens(dayCycleBeats(minuteHour));
    for (const name of CHROME_AIR_TOKEN_NAMES) style.setProperty(name, tokens[name]);
  }, [minuteHour]);

  useEffect(() => () => {
    const style = document.documentElement.style;
    for (const name of CHROME_AIR_TOKEN_NAMES) style.removeProperty(name);
  }, []);
}
