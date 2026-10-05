"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isDebugChromeEnabled } from "../lib/pharosville-debug";
import { audioSceneSnapshot } from "../lib/pharosville-audio/scene-snapshot";
import type { GardenAudioHandle, GardenSoundBeat } from "../lib/pharosville-audio/pharosville-audio";

export const SOUND_STORAGE_KEY = "pharosville.sound";

interface SoundPreference {
  v: 1;
  on: boolean;
  music: boolean;
}

const loadGardenAudio = () => import("../lib/pharosville-audio/pharosville-audio");

function readSoundPreference(): SoundPreference {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SOUND_STORAGE_KEY) ?? "null") as Partial<SoundPreference> | null;
    if (parsed?.v === 1) return { v: 1, on: parsed.on === true, music: parsed.music === true };
  } catch {
    // Storage unavailable or corrupt: both switches start off.
  }
  return { v: 1, on: false, music: false };
}

function persistSoundPreference(preference: SoundPreference): void {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Best effort only.
  }
}

/**
 * `audio=record:N` (query or hash, with `debug=1`): seconds to render offline,
 * or null; `record:N:listen` renders with the listening pose leaned in.
 */
function audioRecordRequest(): { seconds: number; listening: boolean } | null {
  const hash = window.location.hash.replace(/^#\??/, "");
  const value = new URLSearchParams(window.location.search).get("audio") ?? new URLSearchParams(hash).get("audio");
  const match = value ? /^record:(\d+(?:\.\d+)?)(:listen)?$/.exec(value) : null;
  return match ? { seconds: Math.min(600, Math.max(1, Number(match[1]))), listening: match[2] !== undefined } : null;
}

/** The live engine, for the director's beats; null whenever sound is off. */
let liveGardenAudio: GardenAudioHandle | null = null;

/**
 * W7.3: sound a named director beat. Silent unless the visitor has switched
 * Sound on — the beat's DOM caption stays the truth either way.
 */
export function playGardenSoundBeat(beat: GardenSoundBeat, pan = 0): void {
  liveGardenAudio?.playBeat(beat, pan);
}

export interface GardenSoundControls {
  /** The browser has Web Audio at all. */
  supported: boolean;
  soundOn: boolean;
  /** Sound was on last visit and waits for the Sound control; nothing plays until then. */
  armed: boolean;
  /** Still and OS reduced motion keep audio unallocated and silent. */
  reducedMotion: boolean;
  musicOn: boolean;
  /** Call only from the Sound control's own click: the AudioContext is created inside it. */
  onSoundChange: (on: boolean) => void;
  onMusicChange: (on: boolean) => void;
}

/**
 * Sound consent (W7.1, K36/O13). Off by default; the AudioContext is created
 * synchronously inside the Sound switch's click — never on load, never from a
 * key elsewhere, never because a motion preference changed — and only then is
 * the lazy audio chunk fetched. Music is its own switch, off by default. Both
 * choices persist; a returning visitor who left sound on sees it "armed" and
 * still has to switch it on.
 *
 * `stay`: the world is in Stay; with sound on and the viewer idle there, the
 * mix takes its listening pose (X8).
 */
export function useGardenSound(input: { stay?: boolean; reducedMotion?: boolean } = {}): GardenSoundControls {
  const stay = input.stay === true;
  const reducedMotion = input.reducedMotion === true;
  const [preference, setPreference] = useState(readSoundPreference);
  const [soundOn, setSoundOn] = useState(false);
  const [supported] = useState(() => typeof window !== "undefined" && typeof (window.AudioContext ?? window.webkitAudioContext) === "function");
  const [debug] = useState(isDebugChromeEnabled);
  const contextRef = useRef<AudioContext | null>(null);
  const handleRef = useRef<GardenAudioHandle | null>(null);
  const preferenceRef = useRef(preference);
  const stayRef = useRef(stay);

  // Reset the gesture state in the guarded render transition, not an effect.
  // The stored preference stays armed, and lifting Still cannot restart audio.
  if (reducedMotion && soundOn) setSoundOn(false);

  const updatePreference = useCallback((patch: Partial<Omit<SoundPreference, "v">>) => {
    const next = { ...preferenceRef.current, ...patch };
    preferenceRef.current = next;
    persistSoundPreference(next);
    setPreference(next);
  }, []);

  const release = useCallback(() => {
    const context = contextRef.current;
    const handle = handleRef.current;
    contextRef.current = null;
    handleRef.current = null;
    if (liveGardenAudio === handle) liveGardenAudio = null;
    if (handle) handle.close();
    else if (context && context.state !== "closed") void context.close();
  }, []);

  const onSoundChange = useCallback((on: boolean) => {
    if (!on) {
      release();
      setSoundOn(false);
      updatePreference({ on: false });
      return;
    }
    if (reducedMotion || audioSceneSnapshot.reducedMotion || contextRef.current) return;
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;
    // Synchronously inside the click: the user activation is spent before any await.
    const context = new AudioContextClass({ latencyHint: "playback" });
    contextRef.current = context;
    void context.resume();
    setSoundOn(true);
    updatePreference({ on: true });
    loadGardenAudio().then(async (audio) => {
      // Switched off (or unmounted) while the chunk loaded: `release` closed it.
      if (contextRef.current !== context) return;
      const handle = audio.startGardenAudio(context, audioSceneSnapshot, { music: preferenceRef.current.music, debug });
      handle.setStay(stayRef.current);
      handleRef.current = handle;
      liveGardenAudio = handle;
      // The debug recorder is an audition, but still needs this explicit consent.
      const request = debug ? audioRecordRequest() : null;
      if (request) await audio.runAudioRecord(audioSceneSnapshot, request.seconds, null, request.listening, () => contextRef.current === context);
    }).catch(() => {
      if (contextRef.current !== context) return;
      release();
      setSoundOn(false);
    });
  }, [debug, reducedMotion, release, updatePreference]);

  const onMusicChange = useCallback((on: boolean) => {
    handleRef.current?.setMusic(on);
    updatePreference({ music: on });
  }, [updatePreference]);

  useEffect(() => release, [release]);

  useEffect(() => {
    stayRef.current = stay;
    handleRef.current?.setStay(stay);
  }, [stay]);

  useEffect(() => {
    if (!reducedMotion) return;
    release();
    // External resource cleanup only; the render transition resets gesture state.
  }, [reducedMotion, release]);

  return {
    supported,
    soundOn,
    armed: preference.on && !soundOn,
    reducedMotion,
    musicOn: preference.music,
    onSoundChange,
    onMusicChange,
  };
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
