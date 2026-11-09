/** Seeded stereo bed preparation; no source may start until both channels and their seam are ready. */
export function* fillNoise(buf: AudioBuffer, color: "white" | "pink", rnd: () => number): Generator<void> {
  const n = buf.length, sr = buf.sampleRate, slice = 6144;
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = rnd() * 2 - 1;
      if (color === "white") d[i] = w * 0.5;
      else {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      }
      if ((i % slice) === slice - 1) yield;
    }
    const f = Math.min(sr >> 1, n >> 3);
    for (let i = 0; i < f; i++) {
      const a = (i / f) * Math.PI * 0.5;
      d[n - f + i] = d[n - f + i] * Math.cos(a) + d[i] * Math.sin(a);
      if ((i % slice) === slice - 1) yield;
    }
    for (let i = 0; i < n; i += slice) {
      buf.copyToChannel(d.subarray(i, i + slice), ch, i);
      if (n > slice) yield;
    }
  }
}
