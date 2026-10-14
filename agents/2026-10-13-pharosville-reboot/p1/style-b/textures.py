"""Style B texture generator (plain python3 + numpy + PIL). Writes tex/*.png.

    python3 textures.py

  paper.png        1024^2 tileable grey paper grain (R) + fibre (G) + blotch (B); runtime: screen-space multiply
  emblems.png      1024^2 RGBA atlas, 4x4 slots of 256^2 (same slot size as the runtime 4096^2 atlas)
  cloud_{0..3}.png 1024x384 RGBA engraved cumulus banks: R = puff shading, G = ink contour, B = hatch, A = coverage
"""
import os, math, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, 'tex')
os.makedirs(TEX, exist_ok=True)
rng = np.random.default_rng(7)


def spectral_noise(n, beta, aniso=(1.0, 1.0), seed=0):
    r = np.random.default_rng(seed)
    w = r.standard_normal((n, n))
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(n)[:, None] * aniso[1]
    fx = np.fft.fftfreq(n)[None, :] * aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    F *= 1.0 / f ** beta
    F[0, 0] = 0
    out = np.real(np.fft.ifft2(F))
    out = (out - out.mean()) / (out.std() + 1e-9)
    return out


def paper():
    n = 1024
    grain = spectral_noise(n, 0.35, seed=1) * 0.55 + spectral_noise(n, 0.9, seed=2) * 0.45
    fib = np.zeros((n, n))
    for k, ang in enumerate((0.3, 1.2, 2.2, 2.9)):
        c, s = math.cos(ang), math.sin(ang)
        # anisotropic spectrum -> fibres along angle
        r = np.random.default_rng(10 + k)
        F = np.fft.fft2(r.standard_normal((n, n)))
        fy = np.fft.fftfreq(n)[:, None]
        fx = np.fft.fftfreq(n)[None, :]
        u = fx * c + fy * s
        v = -fx * s + fy * c
        f = np.sqrt((u * 6) ** 2 + (v * 0.6) ** 2)
        f[0, 0] = 1
        F *= np.exp(-(f * 18) ** 2) * (f > 0.004)
        fib += np.real(np.fft.ifft2(F))
    fib = (fib - fib.mean()) / fib.std()
    blot = spectral_noise(n, 1.6, seed=3)
    def to8(a, lo=-3, hi=3):
        return np.clip((a - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    img = np.stack([to8(grain), to8(fib), to8(blot)], -1)
    Image.fromarray(img, 'RGB').save(os.path.join(TEX, 'paper.png'))


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def emblems():
    pal = json.load(open(os.path.join(HERE, 'palette.json')))
    S, G = 256, 4
    SS = 4  # supersample
    atlas = Image.new('RGBA', (S * G * 1, S * G * 1), (0, 0, 0, 0))
    font_b = '/usr/share/fonts/noto/NotoSerif-Bold.ttf'
    if not os.path.exists(font_b):
        font_b = '/usr/share/fonts/TTF/DejaVuSerif-Bold.ttf'
    glyphs = {0: 'T', 1: '$', 2: 'D', 3: '€', 4: 'Au', 5: 'P', 6: 'E', 7: 'F', 8: '€'}
    ink = hexrgb(pal['colours']['ink']['hex'])
    cream = hexrgb(pal['colours']['paper']['hex'])
    for name, b in pal['brand'].items():
        i = b['emblem']
        col = hexrgb(b['hex'])
        im = Image.new('RGBA', (S * SS, S * SS), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        c = S * SS / 2
        R = 118 * SS
        d.ellipse((c - R, c - R, c + R, c + R), fill=(*ink, 255))
        R2 = 111 * SS
        d.ellipse((c - R2, c - R2, c + R2, c + R2), fill=(*col, 255))
        R3, w3 = 97 * SS, 3 * SS
        d.ellipse((c - R3, c - R3, c + R3, c + R3), outline=(*cream, 230), width=w3)
        # little engraved dots on the ring, like a coin edge
        for k in range(36):
            a = 2 * math.pi * k / 36
            x, y = c + math.cos(a) * 104 * SS, c + math.sin(a) * 104 * SS
            rr = 2.2 * SS
            d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=(*cream, 160))
        g = glyphs[i]
        size = (130 if len(g) == 1 else 96) * SS
        f = ImageFont.truetype(font_b, size)
        bb = d.textbbox((0, 0), g, font=f)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        d.text((c - tw / 2 - bb[0], c - th / 2 - bb[1]), g, font=f, fill=(*cream, 255))
        im = im.resize((S, S), Image.LANCZOS)
        atlas.paste(im, ((i % G) * S, (i // G) * S))
    atlas.save(os.path.join(TEX, 'emblems.png'))


def fbm2(H, W, scale, seed, oct=4):
    out = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(oct):
        n = spectral_noise(max(H, W), 2.2, seed=seed + o)[:H, :W]
        # resample to the requested scale by zooming
        zy = np.linspace(0, n.shape[0] / (scale * 2 ** o), H, endpoint=False).astype(int) % n.shape[0]
        zx = np.linspace(0, n.shape[1] / (scale * 2 ** o), W, endpoint=False).astype(int) % n.shape[1]
        out += n[zy][:, zx] * amp
        tot += amp
        amp *= 0.5
    return out / tot


def clouds():
    """Engraved cumulus banks: domain-warped billows, broken hairline contours, wash with edge pooling."""
    W, H = 1024, 384
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    for k in range(6):
        r = np.random.default_rng(300 + k)
        stratus = k >= 4
        base = H * (0.78 if not stratus else 0.62)
        def tiled(seed, beta=1.4, n=192):
            t = spectral_noise(n, beta, seed=seed)
            return np.tile(t, (H // n + 1, W // n + 1))[:H, :W]
        warp_x = tiled(40 + k) * (6.5 if not stratus else 3) + spectral_noise(1024, 2.0, seed=90 + k)[:H, :W] * 4
        warp_y = tiled(60 + k) * (6.5 if not stratus else 2) + spectral_noise(1024, 2.0, seed=95 + k)[:H, :W] * 3
        X, Y = xx + warp_x, yy + warp_y
        puffs = []
        if not stratus:
            n = int(r.integers(5, 8))
            for i in range(n):
                t = min(max((i + r.uniform(-0.25, 0.25)) / (n - 1), 0), 1)
                env = max(0.0, math.sin(math.pi * t)) ** 0.9
                rad = 26 + 78 * env * r.uniform(0.6, 1.0)
                puffs.append((130 + t * (W - 260), base - rad * r.uniform(0.3, 0.6) - env * r.uniform(0, 30), rad, r.uniform(1.25, 1.55)))
            for i in range(n - 1):
                t = min(max((i + 0.5 + r.uniform(-0.3, 0.3)) / (n - 1), 0), 1)
                env = max(0.0, math.sin(math.pi * t)) ** 0.7
                rad = 18 + 30 * env * r.uniform(0.6, 1.0)
                puffs.append((110 + t * (W - 220), base - rad * 0.25, rad, r.uniform(1.8, 2.4)))
        else:
            for i in range(9):
                t = i / 8
                env = max(0.0, math.sin(math.pi * t)) ** 0.5
                rad = 6 + 12 * env * r.uniform(0.6, 1.0)
                puffs.append((60 + t * (W - 120), base - rad * 0.2 + r.uniform(-4, 4), rad, r.uniform(5.0, 8.0)))
        owner = np.full((H, W), -1, np.int32)
        dmin = np.full((H, W), 1e9, np.float32)
        for i, (x, y, rad, ex) in enumerate(puffs):
            d = np.sqrt(((X - x) / ex) ** 2 + (Y - y) ** 2) - rad
            owner[d < 0] = i
            dmin = np.minimum(dmin, d)
        dmin = np.maximum(dmin, (Y - base) * 1.5)
        alpha = np.clip(0.5 - dmin / 2.2, 0, 1)
        shadeimg = np.zeros((H, W), np.float32)
        inner = np.zeros((H, W), np.float32)
        for i, (x, y, rad, ex) in enumerate(puffs):
            m = owner == i
            if not m.any():
                continue
            px, py = (X[m] - x) / (rad * ex), (Y[m] - y) / rad
            cap = np.clip((-py * 0.95 - px * 0.3 + 0.2) / 0.6, 0, 1)
            shadeimg[m] = 0.36 + 0.64 * cap ** 0.7
            d = np.sqrt(((X[m] - x) / ex) ** 2 + (Y[m] - y) ** 2) - rad
            inner[m] = np.clip(1 - np.abs(d) / 0.9, 0, 1) * (py < -0.05) * (py > -0.9) * (rad > 30)
        belly = np.clip((yy - (base - 30)) / 30, 0, 1)
        shadeimg = shadeimg * (1 - 0.32 * belly)
        # watercolour pooling just inside the silhouette
        pool = np.exp(-np.clip(-dmin, 0, None) / 5.0) * (alpha > 0.1)
        shadeimg = shadeimg * (1 - 0.22 * pool)
        brk = spectral_noise(1024, 1.4, seed=80 + k)[:H, :W]
        outline = np.clip(1 - np.abs(dmin) / 0.9, 0, 1) * (yy < base - 3) * np.clip((brk + 0.6) / 0.6, 0, 1)
        ink = np.maximum(outline, inner * 0.45 * np.clip((brk + 0.2) / 0.5, 0, 1))
        hl = 0.5 + 0.5 * np.sin(yy * 1.05 + xx * 0.08)
        hatch = np.clip((hl - 0.8) / 0.1, 0, 1) * np.clip((0.5 - shadeimg) / 0.15, 0, 1) * (alpha > 0.6)
        def soft(a, r=1):
            out = a.copy()
            for _ in range(2):
                out = (out + np.roll(out, 1, 0) + np.roll(out, -1, 0) + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 5.0
            return out
        alpha = soft(alpha)
        shadeimg = soft(shadeimg)
        img = np.stack([shadeimg, ink, hatch, alpha], -1)
        Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(TEX, f'cloud_{k}.png'))


if __name__ == '__main__':
    paper()
    emblems()
    clouds()
    print('textures ok')
