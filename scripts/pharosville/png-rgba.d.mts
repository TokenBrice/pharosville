interface RgbaStripLevel {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export function validatePublishedRgbaStrip(bytes: Buffer, options: {
  width: number;
  height: number;
  colorSpace: "linear" | "srgb";
  levels: RgbaStripLevel[];
  label: string;
}): void;

export function pngChunk(type: string, data: Buffer): Buffer;
