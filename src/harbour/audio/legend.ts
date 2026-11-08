/**
 * The "By ear" sentences: one source for the sound menu, the Ledger and the panel details.
 * Dependency-free so the overlay can import it without loading the audio runtime.
 */
export const SOUND_SURF = "Surf follows sea state: the share of supply off peg.";
export const SOUND_WEATHER = "Wind, rain and thunder follow early-warning stress.";
export const SOUND_FOG = "The foghorn means stale data.";
export const SOUND_PHAROS = "The Pharos breath follows the beam’s reach and falls silent when its reading is unavailable or stale.";
export const SOUND_FLOW = "Mint and Burn sounds follow their displayed activity and stop when banked.";
export const SOUND_DECORATIVE = "Other harbour sounds and music are decorative.";
export const BY_EAR = [SOUND_SURF, SOUND_WEATHER, SOUND_FOG, SOUND_PHAROS, SOUND_FLOW, SOUND_DECORATIVE].join(" ");
