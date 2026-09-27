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
export function SoundControl({ supported, soundOn, armed, musicOn, onSoundChange, onMusicChange }: GardenSoundControls) {
  const state = soundOn ? "on" : armed ? "off, on last visit" : "off";
  const Glyph = soundOn ? Volume2 : armed ? Volume1 : VolumeX;
  return (
    <details className="pv-drawer-control" data-sound={soundOn ? "on" : armed ? "armed" : "off"}>
      <summary className="pv-glyph-button" aria-label={`Sound: ${state}`} title="Sound">
        <Glyph aria-hidden="true" size={17} strokeWidth={1.5} />
      </summary>
      <div className="pv-drawer pv-paper" role="group" aria-label="Sound">
        <label className="pv-drawer__row">
          <span>Sound</span>
          <input
            type="checkbox"
            role="switch"
            className="pv-drawer__switch"
            checked={soundOn}
            disabled={!supported}
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
            disabled={!supported}
            onChange={(event) => onMusicChange(event.currentTarget.checked)}
          />
        </label>
        <p className="pv-drawer__note">
          {!supported
            ? "This browser cannot play the harbour's sound."
            : armed
              ? "Sound was on last visit. Switch it on to hear the harbour again."
              : "Sound follows the sea and the hour; music plays only with sound on. Every reading is also written in the ledger."}
        </p>
      </div>
    </details>
  );
}
