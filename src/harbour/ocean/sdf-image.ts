import type { EngineContext } from "../engine/types";
import { assetUrl } from "../engine/assets";
import { decodeSdfBytes } from "./sdf-codec";

/** The baked sea SDF image, rows from minZ: RGBA bytes, and its R (coast distance) channel alone. */
export interface SdfImage { readonly data: Uint8Array; readonly coast: Uint8Array; readonly width: number; readonly height: number }

/**
 * The exact baked sea field decoded ONCE per engine: the sim reads coast, the ocean uploads RGBA.
 * Production NSD1 reconstructs into the final arrays (12 MiB encoded + 20 MiB output maximum).
 * Development retains the authored lossless WebP. Callers only read the shared result.
 */
export function loadSdfImage(ctx: EngineContext, url: string): Promise<SdfImage | null> {
  const key = `sdf-image:${url}`;
  let p = ctx.services.get(key) as Promise<SdfImage | null> | undefined;
  if (!p) ctx.services.set(key, (p = decode(url)));
  return p;
}

async function decode(url: string): Promise<SdfImage | null> {
  try {
    url = assetUrl(url);
    const res = await fetch(url);
    if (!res.ok) return null;
    if (url.endsWith(".bin.br")) return decodeSdfBytes(await res.arrayBuffer());
    if (!(res.headers.get("content-type") ?? "").includes("image")) return null;
    const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const w = bmp.width, h = bmp.height;
    const c2 = new OffscreenCanvas(w, h).getContext("2d", { willReadFrequently: true });
    if (!c2) return null;
    c2.drawImage(bmp, 0, 0);
    bmp.close();
    const px = c2.getImageData(0, 0, w, h).data;
    // the image's top row is z = maxZ (three's flipY convention); runtime rows run from minZ
    const row = w * 4, data = new Uint8Array(w * h * 4), coast = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) data.set(px.subarray((h - 1 - j) * row, (h - j) * row), j * row);
    for (let i = 0; i < coast.length; i++) coast[i] = data[i * 4];
    return { data, coast, width: w, height: h };
  } catch {
    return null;
  }
}
