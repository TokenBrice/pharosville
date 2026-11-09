import { OCEAN_SURFACE } from "./shaders/surface";
import { OCEAN_REFLECTION } from "./shaders/reflection";
import { OCEAN_FOAM } from "./shaders/foam-wake";
import { OCEAN_HORIZON } from "./shaders/horizon";
export { OCEAN_VERT } from "./shaders/surface-vertex";

/** Style C sea ramp (sRGB hex, palette.json) + the A-graft sunlit shallows. */
export const SEA_PALETTE = {
  abyss: "#0F2F47",
  deep: "#123A52",
  mid: "#194C5E",
  shallow: "#21615F",
  shoal: "#4F8A80",
  sunlitShoal: "#55B5A6",
  foam: "#F6F7F2",
  foamNight: "#B9C8E6",
};

export const OCEAN_FRAG = `${OCEAN_SURFACE}${OCEAN_REFLECTION}${OCEAN_FOAM}${OCEAN_HORIZON}`;
