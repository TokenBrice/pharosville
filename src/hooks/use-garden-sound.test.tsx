// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SoundControl } from "../components/sound-control";
import { audioSceneSnapshot } from "../lib/pharosville-audio/scene-snapshot";
import { SOUND_STORAGE_KEY, useGardenSound } from "./use-garden-sound";

const audio = vi.hoisted(() => ({
  chunkLoads: 0,
  handle: { close: vi.fn(), playBeat: vi.fn(), setMusic: vi.fn(), setStay: vi.fn() },
  startGardenAudio: vi.fn(),
  runAudioRecord: vi.fn(),
}));

vi.mock("../lib/pharosville-audio/pharosville-audio", () => {
  audio.chunkLoads += 1;
  audio.startGardenAudio.mockImplementation(() => audio.handle);
  return { runAudioRecord: audio.runAudioRecord, startGardenAudio: audio.startGardenAudio };
});

class FakeAudioContext {
  static constructed: FakeAudioContext[] = [];
  state = "running";
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
  constructor() {
    FakeAudioContext.constructed.push(this);
  }
}

function Harness({ reducedMotion = false }: { reducedMotion?: boolean }) {
  return <SoundControl {...useGardenSound({ reducedMotion })} />;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  FakeAudioContext.constructed = [];
  audioSceneSnapshot.reducedMotion = false;
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
});

describe("useGardenSound consent", () => {
  it("creates no AudioContext and loads no audio until the Sound switch is clicked", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    // A returning visitor who left sound on: armed, but still silent.
    window.localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ v: 1, on: true, music: true }));
    render(<Harness />);
    expect(screen.getByLabelText("Sound: off, on last visit")).toBeTruthy();

    // Keys, pointers, opening the drawer and the Music switch never start audio.
    fireEvent.keyDown(document, { key: " " });
    fireEvent.keyDown(document.body, { key: "Enter" });
    fireEvent.pointerDown(document.body);
    fireEvent.click(screen.getByLabelText("Sound: off, on last visit"));
    fireEvent.click(screen.getByRole("switch", { name: "Music" }));
    fireEvent.click(screen.getByRole("switch", { name: "Music" }));
    expect(FakeAudioContext.constructed).toHaveLength(0);
    expect(audio.chunkLoads).toBe(0);

    fireEvent.click(screen.getByRole("switch", { name: "Sound" }));
    // Inside the click itself, before any await: the activation is spent on it.
    expect(FakeAudioContext.constructed).toHaveLength(1);
    expect(FakeAudioContext.constructed[0]!.resume).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(audio.startGardenAudio).toHaveBeenCalledTimes(1));
    expect(audio.chunkLoads).toBe(1);
    expect(audio.startGardenAudio).toHaveBeenCalledWith(
      FakeAudioContext.constructed[0],
      audioSceneSnapshot,
      { music: true, debug: false },
    );
    expect(screen.getByLabelText("Sound: on")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "Sound" }));
    expect(audio.handle.close).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(SOUND_STORAGE_KEY)!)).toEqual({ v: 1, on: false, music: true });
    expect(FakeAudioContext.constructed).toHaveLength(1);
  });

  it("describes the exact garden sound before consent", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    render(<Harness />);
    expect(screen.getByRole("switch", { name: "Sound" }).getAttribute("aria-describedby")).toBe("pv-garden-sound-description");
    expect(screen.getByText(/Plays shore water, pine wind, basin drips and distant harbour work/)).toBeTruthy();
    expect(FakeAudioContext.constructed).toHaveLength(0);
  });

  it("allocates no context or lazy chunk under Still, even with stored consent and an audition query", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    window.history.replaceState(null, "", "/?debug=1&audio=record:10");
    window.localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ v: 1, on: true, music: false }));
    const loads = audio.chunkLoads;
    render(<Harness reducedMotion />);
    const control = screen.getByRole("switch", { name: "Sound" });
    expect((control as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(control);
    expect(FakeAudioContext.constructed).toHaveLength(0);
    expect(audio.chunkLoads).toBe(loads);
    expect(audio.runAudioRecord).not.toHaveBeenCalled();
  });

  it("closes active sound on Still and only arms it when motion returns", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("switch", { name: "Sound" }));
    await waitFor(() => expect(audio.startGardenAudio).toHaveBeenCalledTimes(1));
    view.rerender(<Harness reducedMotion />);
    expect(audio.handle.close).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Sound: off, on last visit")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(SOUND_STORAGE_KEY)!)).toMatchObject({ v: 1, on: true });
    view.rerender(<Harness />);
    expect(FakeAudioContext.constructed).toHaveLength(1);
    expect(audio.startGardenAudio).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("switch", { name: "Sound" }));
    expect(FakeAudioContext.constructed).toHaveLength(2);
  });

  it("does not fetch or render an offline audition before a Sound gesture", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    window.history.replaceState(null, "", "/?debug=1&audio=record:10");
    const loads = audio.chunkLoads;
    const view = render(<Harness />);
    expect(FakeAudioContext.constructed).toHaveLength(0);
    expect(audio.chunkLoads).toBe(loads);
    expect(audio.runAudioRecord).not.toHaveBeenCalled();
    view.unmount();
    expect(audio.handle.close).not.toHaveBeenCalled();
  });

  it("disposes the consented engine on unmount", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("switch", { name: "Sound" }));
    await waitFor(() => expect(audio.startGardenAudio).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(audio.handle.close).toHaveBeenCalledTimes(1);
  });
});
