"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { DayCycleBeats } from "../systems/day-cycle-beats";

/** Pointer stillness after which the cursor dissolves in Stay. */
export const STAY_CURSOR_IDLE_MS = 4_000;

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

function stayRequestedByUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("stay") === "1";
}

/**
 * W6.9 — Stay: the harbour as a window you leave open. The page goes full
 * screen when the browser allows it, the screen is kept awake, the chrome and
 * then the cursor fade, and the world holds its rest shot with no attract.
 * Only Escape or a click leaves; pointer movement alone does not. `?stay=1`
 * opens a kiosk straight into it (fullscreen then needs a click the browser
 * will not grant, so it stays windowed). Fullscreen and wake lock fail
 * silently.
 */
export function useStayMode(input: {
  shellRef: RefObject<HTMLElement | null>;
  setAnnouncement: (message: string) => void;
  /** Clears selection and panels and returns the camera to rest. */
  onEnter: () => void;
}) {
  const { onEnter, setAnnouncement, shellRef } = input;
  const [stay, setStay] = useState(stayRequestedByUrl);
  const enteredFullscreenRef = useRef(false);

  const enterStay = useCallback(() => {
    // Move focus off the pressed control so Stay can fade the chrome;
    // Tab brings the focused discovery actions straight back.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    onEnter();
    setStay(true);
    setAnnouncement("Stay: the harbour stays open as a window. Press Escape to return.");
    // Fullscreen needs the user activation of the click that called this, so
    // it is requested here rather than from an effect.
    const root = document.documentElement;
    if (!document.fullscreenElement && typeof root.requestFullscreen === "function") {
      root.requestFullscreen().then(() => {
        enteredFullscreenRef.current = true;
      }, () => undefined);
    }
  }, [onEnter, setAnnouncement]);

  const exitStay = useCallback(() => {
    setStay(false);
    setAnnouncement("Left Stay.");
    if (enteredFullscreenRef.current && document.fullscreenElement && typeof document.exitFullscreen === "function") {
      document.exitFullscreen().catch(() => undefined);
    }
    enteredFullscreenRef.current = false;
  }, [setAnnouncement]);

  // Escape, a click, or leaving fullscreen by the browser's own control ends
  // Stay. The click that ends it is swallowed so it cannot also select.
  useEffect(() => {
    if (!stay) return undefined;
    let swallowClick = false;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      exitStay();
    };
    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      swallowClick = true;
      exitStay();
    };
    const handleClick = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const handleFullscreenChange = () => {
      if (document.fullscreenElement || !enteredFullscreenRef.current) return;
      enteredFullscreenRef.current = false;
      exitStay();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("click", handleClick, true);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("click", handleClick, true);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [exitStay, stay]);

  // The screen does not sleep while the window is open; the lock is dropped
  // by the browser when the tab hides, so it is taken again on return.
  useEffect(() => {
    if (!stay) return undefined;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return undefined;
    let sentinel: WakeLockSentinelLike | null = null;
    let active = true;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      wakeLock.request("screen").then((lock) => {
        if (active) sentinel = lock;
        else lock.release().catch(() => undefined);
      }, () => undefined);
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", acquire);
      sentinel?.release().catch(() => undefined);
    };
  }, [stay]);

  // The cursor dissolves after four still seconds and returns on movement.
  // Written straight to the shell so pointer movement never re-renders.
  useEffect(() => {
    const shell = shellRef.current;
    if (!stay || !shell) return undefined;
    let timer = 0;
    const wake = () => {
      shell.dataset.stayCursor = "active";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        shell.dataset.stayCursor = "hidden";
      }, STAY_CURSOR_IDLE_MS);
    };
    wake();
    window.addEventListener("pointermove", wake, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      delete shell.dataset.stayCursor;
    };
  }, [shellRef, stay]);

  return { enterStay, exitStay, stay };
}

/**
 * Whether the now-line surfaces during Stay: while something true is being
 * said (a stale feed, an arrival, a transition, the visitor line), and for
 * the minute after the day's beat turns or the hour strikes. A pinned hour
 * never strikes, so a kiosk at `t=21` stays dark until something happens.
 */
export function useStayCaptionSurfacing(input: {
  beats: DayCycleBeats;
  /** Caption clock, whole minutes, in hours. */
  captionHour: number;
  eventLive: boolean;
}): boolean {
  const { beats, captionHour, eventLive } = input;
  let beat = "dawn";
  for (const [name, weight] of Object.entries(beats)) {
    if (weight > (beats[beat as keyof DayCycleBeats] ?? 0)) beat = name;
  }
  const key = `${beat}|${Math.floor(captionHour)}`;
  const [mark, setMark] = useState({ key, since: Number.NaN });
  if (mark.key !== key) setMark({ key, since: captionHour });
  return eventLive || mark.since === captionHour;
}
