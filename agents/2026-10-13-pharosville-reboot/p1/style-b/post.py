"""Style B post stack (numpy; each step is one screen-space pass in the WebGL2 runtime).

    python3 post.py work/overview-golden.exr out.png [--state golden]

 1. tone: exposure + soft shoulder (filmic-lite) on the scene-linear wash         -> tonemap pass
 2. bloom: threshold + 3-scale blur, added in linear                               -> standard bloom chain
 3. ink: depth (log) + normal Sobel edges on surfaces with inkmask                 -> edge pass (depth/normal MRT)
 4. pigment: edge darkening from a difference of blurs (wash pooling at colour edges)
 5. wobble: wash displaced +-1 px by paper fibre noise; ink kept registered        -> UV offset in the final pass
 6. paper: granulation multiply + paper tint in highlights + warm vignette         -> one texture fetch
"""
import sys, os, math
import numpy as np
import OpenImageIO as oiio
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def read_exr(path):
    inp = oiio.ImageInput.open(path)
    out = {}
    k = 0
    while inp.seek_subimage(k, 0):
        spec = inp.spec()
        px = inp.read_image(0, 0, 0, spec.nchannels, 'float')
        names = spec.channelnames
        layer = names[0].split('.')[1]
        out[layer] = np.asarray(px).reshape(spec.height, spec.width, spec.nchannels)
        k += 1
    inp.close()
    return out


def box(img, r, axis):
    if r < 1:
        return img
    r = int(r)
    pad = [(0, 0)] * img.ndim
    pad[axis] = (r + 1, r)
    p = np.pad(img, pad, mode='edge')
    c = np.cumsum(p, axis=axis, dtype=np.float64)
    n = img.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(img, sigma):
    """~Gaussian via 3 box passes per axis."""
    if sigma <= 0.3:
        return img
    r = max(1, int(round(math.sqrt(12 * sigma * sigma / 3 + 1) / 2)))
    out = img
    for _ in range(3):
        out = box(out, r, 0)
        out = box(out, r, 1)
    return out


def lum(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def lin(h):
    h = h.lstrip('#')
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


PRESETS = {
    'golden': dict(wash=(0.24, 0.12, 0.75, lin('#FFD9A8'), 0.16), exposure=1.0, bloom=0.10, bloom_thr=1.1, ink=lin('#3B2A1F'), ink_k=0.55, pool=0.55,
                   paper_tint=lin('#F6EBD3'), gran=0.10, vignette=0.24, vig_col=lin('#7A5A44'), sat=1.06),
    'noon': dict(wash=(0.75, 0.0, 0.9, lin('#FFF8E8'), 0.06), exposure=1.0, bloom=0.05, bloom_thr=1.2, ink=lin('#3B2A1F'), ink_k=0.5, pool=0.5,
                 paper_tint=lin('#F7EEDB'), gran=0.10, vignette=0.2, vig_col=lin('#7A6A58'), sat=1.02),
    'night': dict(wash=(0.2, 0.07, 0.6, lin('#8FA2E0'), 0.10), exposure=1.0, bloom=0.55, bloom_thr=0.55, ink=lin('#14122A'), ink_k=0.45, pool=0.45,
                  paper_tint=lin('#E8E2D2'), gran=0.12, vignette=0.32, vig_col=lin('#0E0D22'), sat=1.0),
}


def process(src, dst, state='golden', debug=False):
    E = read_exr(src)
    col = E['Combined'][..., :3].astype(np.float32)
    H, Wd = col.shape[:2]
    Z = E['Depth'][..., 0]
    Nn = E['Normal'][..., :3]
    ink_m = E['inkmask'][..., 0]
    pr = PRESETS[state]
    scale = Wd / 1600.0
    # 1. tone: exposure + soft shoulder above 0.8
    col = col * pr['exposure']
    over = np.maximum(col - 0.8, 0)
    toned = np.minimum(col, 0.8) + over / (1 + over / 0.35)
    # 2. bloom (from untoned)
    b = np.maximum(col - pr['bloom_thr'], 0)
    bl = blur(b, 3 * scale) * 0.5 + blur(b, 10 * scale) * 0.35 + blur(b, 30 * scale) * 0.4
    toned = toned + bl * pr['bloom']
    # 4. pigment pooling at wash edges (difference of blurs, darken the darker side)
    L0 = lum(toned)
    Lb = blur(L0, 2.5 * scale)
    dark = np.clip((Lb - L0) / (Lb + 0.05), 0, 1)
    dens = 1 + pr['pool'] * dark * 2.2
    toned = np.power(np.clip(toned, 1e-5, None), dens[..., None])
    # 5. wobble (wash only)
    paper = np.asarray(Image.open(os.path.join(HERE, 'tex', 'paper.png'))).astype(np.float32) / 255.0
    ph, pw = paper.shape[:2]
    yy, xx = np.mgrid[0:H, 0:Wd]
    pgrid = paper[(yy / scale).astype(int) % ph, (xx / scale).astype(int) % pw]
    off = (blur(pgrid[..., 2] - 0.5, 6 * scale) * 3.5 * scale)
    off2 = (blur(pgrid[..., 1] - 0.5, 6 * scale) * 3.5 * scale)
    sx = np.clip((xx + off).round().astype(int), 0, Wd - 1)
    sy = np.clip((yy + off2).round().astype(int), 0, H - 1)
    toned = toned[sy, sx]
    # 3. ink edges from depth + normals (registered, i.e. not wobbled)
    lz = np.log(np.maximum(Z, 0.1))
    gx = np.zeros_like(lz); gy = np.zeros_like(lz)
    gx[:, 1:-1] = lz[:, 2:] - lz[:, :-2]
    gy[1:-1, :] = lz[2:, :] - lz[:-2, :]
    # second derivative catches creases between planes at similar depth
    lap = np.abs(4 * lz - np.roll(lz, 1, 0) - np.roll(lz, -1, 0) - np.roll(lz, 1, 1) - np.roll(lz, -1, 1))
    de = np.clip((lap - 0.004) / 0.01, 0, 1)
    dn = np.zeros((H, Wd), np.float32)
    for ax in (0, 1):
        a = np.roll(Nn, 1, ax)
        dn = np.maximum(dn, 1 - np.clip((Nn * a).sum(-1), -1, 1))
    ne = np.clip((dn - 0.25) / 0.35, 0, 1)
    m = np.clip(ink_m, 0, 1)
    mm = np.minimum(m, np.roll(m, 1, 0))
    mm = np.minimum(mm, np.roll(m, 1, 1))
    edge = np.maximum(de * np.clip((mm - 0.2) / 0.2, 0, 1), ne * 0.8 * np.clip((mm - 0.6) / 0.2, 0, 1))
    edge = np.clip(edge, 0, 1)
    edge = np.maximum(edge, blur(edge, 0.6 * scale) * 0.8)
    inkc = pr['ink']
    toned = toned * (1 - edge[..., None] * pr['ink_k']) + inkc * edge[..., None] * pr['ink_k'] * 0.5
    # 5b. light wash: screen-space radial glow from the sun / moon (aerial light, value framing)
    cx, cy, rad, wc, wk = pr['wash']
    dd = np.sqrt(((xx / Wd - cx) * Wd / H) ** 2 + (yy / H - cy) ** 2)
    g = np.clip(1 - dd / rad, 0, 1) ** 2 * wk
    toned = toned + g[..., None] * wc
    # 6. paper: tint highlights, granulation, vignette
    grain = (pgrid[..., 0] - 0.5) * 0.7 + (pgrid[..., 1] - 0.5) * 0.3
    L1 = lum(toned)
    toned = toned * (1 - pr['gran'] * grain[..., None] * (0.25 + 0.75 * (1 - np.clip(L1, 0, 1)))[..., None] * 2)
    toned = np.minimum(toned, pr['paper_tint'] * 1.04) * 0.15 + toned * 0.85
    toned = toned * (pr['paper_tint'] / pr['paper_tint'].max()) ** 0.35
    ny = (yy / H - 0.5) * 2
    nx = (xx / Wd - 0.5) * 2
    v = np.clip((nx * nx * 0.8 + ny * ny) - 0.35, 0, None) ** 1.3 * pr['vignette']
    toned = toned * (1 - v[..., None]) + pr['vig_col'] * v[..., None] * 0.6
    # saturation
    L2 = lum(toned)[..., None]
    toned = L2 + (toned - L2) * pr['sat']
    out = (srgb(toned) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(out).save(dst)
    if debug:
        Image.fromarray((edge * 255).astype(np.uint8)).save(dst.replace('.png', '_edge.png'))


if __name__ == '__main__':
    a = sys.argv[1:]
    st = a[a.index('--state') + 1] if '--state' in a else os.path.basename(a[0]).split('-')[1].split('.')[0]
    process(a[0], a[1], st, '--debug' in a)
    print('wrote', a[1])
