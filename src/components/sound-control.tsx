"use client";

import Volume1 from "lucide-react/dist/esm/icons/volume-1";
import Volume2 from "lucide-react/dist/esm/icons/volume-2";
import VolumeX from "lucide-react/dist/esm/icons/volume-x";
import type { GardenSoundControls } from "../hooks/use-garden-sound";

/**
 * W7.1 Sound drawer: an honest speaker glyph (never a bell, never animated)
 * over two switches — Sound, and Music as its own consent. The Sound switch's
 * click is the only thing in the app that can start audio.
 */
export function SoundControl({ supported, soundOn, armed, reducedMotion, musicOn, onSoundChange, onMusicChange }: GardenSoundControls) {
  const state = soundOn ? "on" : armed ? "off, on last visit" : "off";
  const Glyph = soundOn ? Volume2 : armed ? Volume1 : VolumeX;
  return (
    <details className="pv-drawer-control" data-sound={soundOn ? "on" : armed ? "armed" : "off"}>
      <summary className="pv-glyph-button" aria-label={`Sound: ${state}`} title="Garden sound">
        <Glyph aria-hidden="true" size={17} strokeWidth={1.5} />
      </summary>
      <div className="pv-drawer pv-paper" role="group" aria-label="Sound">
        <label className="pv-drawer__row">
          <span>Sound</span>
          <input
            type="checkbox"
            role="switch"
            className="pv-drawer__switch"
            aria-describedby="pv-garden-sound-description"
            checked={soundOn}
            disabled={!supported || reducedMotion}
            onChange={(event) => onSoundChange(event.currentTarget.checked)}
          />
        </label>
        <label className="pv-drawer__row">
          <span>Music</span>
          <input
            type="checkbox"
            role="switch"
            className="pv-drawer__switch"
            checked={musicOn}
            disabled={!supported || reducedMotion}
            onChange={(event) => onMusicChange(event.currentTarget.checked)}
          />
        </label>
        <p className="pv-drawer__note" id="pv-garden-sound-description">
          {!supported
            ? "This browser cannot play garden sound."
            : reducedMotion
              ? "Still and reduced motion are silent. Turn Still off before choosing garden sound."
              : armed
                ? "Sound was on last visit. Switch it on for shore water, pine wind, basin drips and distant harbour work."
                : "Plays shore water, pine wind, basin drips and distant harbour work, following the garden’s hour. Music is separate. Every reading remains in the ledger."}
        </p>
      </div>
    </details>
  );
}
