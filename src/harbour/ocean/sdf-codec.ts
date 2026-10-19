/** NSD1: 12-byte header, then row-reset horizontal deltas of the three exact RGB planes. */
export function decodeSdfBytes(buffer: ArrayBuffer) {
  if (buffer.byteLength < 12) throw new Error("Truncated sea data");
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x3144534e) throw new Error("Unsupported sea data");
  const width = header.getUint32(4, true), height = header.getUint32(8, true);
  // The authored field is 2048². Cap allocations before trusting any network dimensions.
  if (!width || !height || width > 2048 || height > 2048 || buffer.byteLength !== 12 + width * height * 3) {
    throw new Error("Invalid sea dimensions");
  }
  const count = width * height, encoded = new Uint8Array(buffer, 12);
  const data = new Uint8Array(count * 4), coast = new Uint8Array(count);
  for (let channel = 0; channel < 3; channel++) {
    for (let y = 0; y < height; y++) {
      let value = 0;
      const sourceRow = channel * count + y * width, targetRow = (height - 1 - y) * width;
      for (let x = 0; x < width; x++) {
        value = (value + encoded[sourceRow + x]) & 255;
        const i = targetRow + x;
        data[i * 4 + channel] = value;
        if (channel === 0) { coast[i] = value; data[i * 4 + 3] = 255; }
      }
    }
  }
  return { data, coast, width, height };
}
