"""Multi-epoch SPHEREx cutout time-lapse builder.

Real path (follows IRSA's "SPHEREx Spectral Image Cutouts" tutorial):
  IRSA TAP (spherex.plane JOIN spherex.artifact) -> per-file cutout URL (?center=RA,DECd&size=DEG)
  -> FITS IMAGE/FLAGS -> reproject to a common TAN grid -> shared-stretch PNG frames.
Fallback: deterministic synthetic field (flagged ``source="synthetic"``) when IRSA is unreachable.
New data releases appear in the same TAP tables, so no code change is needed.
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import warnings
from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np
from astropy.wcs import WCS
from PIL import Image

log = logging.getLogger(__name__)

PIX_SCALE_ARCSEC = 6.2
MJD_EPOCH0 = date(1858, 11, 17)


@dataclass
class Frame:
    index: int
    obs_id: str
    epoch_mjd: float
    obs_date: str
    wavelength_um: float
    detector: int
    quality_pct: float
    image_b64: str = ""


@dataclass
class Timelapse:
    source: str  # "irsa" | "synthetic"
    ra: float
    dec: float
    fov_arcmin: float
    size_px: int
    frames: list[Frame] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def mjd_to_date(mjd: float) -> str:
    return (MJD_EPOCH0 + timedelta(days=int(mjd))).isoformat()


def target_wcs(ra: float, dec: float, size_px: int) -> WCS:
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [size_px / 2 + 0.5, size_px / 2 + 0.5]
    w.wcs.cdelt = [-PIX_SCALE_ARCSEC / 3600.0, PIX_SCALE_ARCSEC / 3600.0]
    return w


def size_for_fov(fov_arcmin: float) -> int:
    return int(max(16, min(256, round(fov_arcmin * 60.0 / PIX_SCALE_ARCSEC))))


def stretch_limits(arrays: list[np.ndarray]) -> tuple[float, float]:
    """One shared (vmin, vmax) so brightness is comparable between frames."""
    stack = np.concatenate([a[np.isfinite(a)].ravel() for a in arrays if np.isfinite(a).any()] or [np.zeros(1)])
    lo, hi = np.percentile(stack, [5.0, 99.7])
    if hi <= lo:
        hi = lo + 1e-6
    return float(lo), float(hi)


def render_png_b64(data: np.ndarray, vmin: float, vmax: float, out_px: int = 384) -> str:
    norm = np.clip((np.nan_to_num(data, nan=vmin) - vmin) / (vmax - vmin), 0, 1)
    norm = np.arcsinh(norm * 10.0) / np.arcsinh(10.0)  # gentle asinh stretch keeps faint sources visible
    img = Image.fromarray((norm * 255).astype(np.uint8), mode="L").resize((out_px, out_px), Image.NEAREST)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- synthetic fallback
def build_synthetic(ra: float, dec: float, fov_arcmin: float, n_frames: int = 12) -> Timelapse:
    size = size_for_fov(fov_arcmin)
    rng = np.random.default_rng(int(abs(ra * 1000 + dec * 100)) % (2**32))
    yy, xx = np.mgrid[0:size, 0:size]
    stars = [(rng.uniform(4, size - 4), rng.uniform(4, size - 4), rng.uniform(80, 400)) for _ in range(max(6, size // 6))]
    arrays, meta = [], []
    for i in range(n_frames):
        mjd = 60800.0 + i * 15.2  # ~6-month baseline
        img = rng.normal(15, 2.2, (size, size)).astype(np.float32)
        for sx, sy, f in stars:
            img += f * np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * 1.3**2))
        # fast mover: crosses ~35% of the field over the baseline
        mx = size * 0.3 + (i / max(n_frames - 1, 1)) * size * 0.35
        my = size * 0.55 - (i / max(n_frames - 1, 1)) * size * 0.1
        img += 260 * np.exp(-((xx - mx) ** 2 + (yy - my) ** 2) / (2 * 1.4**2))
        arrays.append(img)
        meta.append(mjd)
    vmin, vmax = stretch_limits(arrays)
    tl = Timelapse("synthetic", ra, dec, fov_arcmin, size,
                   notes=["Synthetic demo frames: IRSA was unreachable. Do not use for science."])
    for i, (a, mjd) in enumerate(zip(arrays, meta)):
        tl.frames.append(Frame(i, f"synthetic_{i}", mjd, mjd_to_date(mjd), 0.75 + 0.35 * i, (i % 6) + 1, 100.0,
                               render_png_b64(a, vmin, vmax)))
    return tl


# ---------------------------------------------------------------- real IRSA path
IRSA_BASE = "https://irsa.ipac.caltech.edu/"
DEFAULT_TAP_URL = "https://irsa.ipac.caltech.edu/TAP"


def build_adql(ra: float, dec: float, fov_deg: float, bandpass: str | None) -> str:
    """ADQL from IRSA's spherex-cutouts tutorial: one row per spectral image covering (ra, dec)."""
    band = f"AND p.energy_bandpassname = '{bandpass}'" if bandpass else ""
    return (
        "SELECT "
        f"'{IRSA_BASE}' || a.uri || '?center={ra:.7f},{dec:.7f}d&size={fov_deg:.6f}' AS uri, "
        "p.time_bounds_lower AS mjd, p.energy_bandpassname AS bandpass "
        "FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid "
        f"WHERE 1 = CONTAINS(POINT('ICRS', {ra:.7f}, {dec:.7f}), p.poly) {band} "
        "ORDER BY p.time_bounds_lower"
    )


def _tap_search(tap_url: str, adql: str):
    import pyvo

    return pyvo.dal.TAPService(tap_url).run_sync(adql, maxrec=2000).to_table()


def _bandpass_for(detector: int | None) -> str | None:
    return f"SPHEREx-D{detector}" if detector else None


def _array_center_um(bandpass: str) -> float:
    edges = (0.75, 1.11, 1.64, 2.42, 3.82, 4.42, 5.00)
    try:
        a = int(bandpass[-1]) - 1
        return float((edges[a] * edges[a + 1]) ** 0.5)
    except Exception:
        return 0.0


async def build_from_irsa(
    tap_url: str,
    ra: float,
    dec: float,
    fov_arcmin: float,
    detector: int | None,
    max_frames: int,
    timeout: float = 60.0,
    _fetch=None,
) -> Timelapse:
    import httpx
    from reproject import reproject_interp
    from astropy.io import fits

    loop = asyncio.get_running_loop()
    fov_deg = fov_arcmin / 60.0
    adql = build_adql(ra, dec, fov_deg, _bandpass_for(detector))
    table = await asyncio.wait_for(loop.run_in_executor(None, _tap_search, tap_url, adql), timeout)
    rows = [(str(r["uri"]), float(r["mjd"] or 0.0), str(r["bandpass"])) for r in table]
    if not rows:
        raise RuntimeError("IRSA returned no SPHEREx observations for this position")
    notes: list[str] = []
    if detector is None:  # a time-lapse must compare like with like: keep the best-sampled array
        by_band: dict[str, list] = {}
        for r in rows:
            by_band.setdefault(r[2], []).append(r)
        best = max(by_band, key=lambda k: len(by_band[k]))
        rows = by_band[best]
        notes.append(f"{len(by_band)} detector arrays cover this field; showing {best} ({len(rows)} images).")
    rows.sort(key=lambda r: r[1])
    if len(rows) > max_frames:  # thin evenly across time
        idx = np.linspace(0, len(rows) - 1, max_frames).round().astype(int)
        rows = [rows[i] for i in idx]

    size = size_for_fov(fov_arcmin)
    out_wcs = target_wcs(ra, dec, size)

    async def grab(client, row):
        r = await client.get(row[0])
        r.raise_for_status()
        return row, r.content

    if _fetch is not None:
        fetched = await asyncio.gather(*(_fetch(r) for r in rows), return_exceptions=True)
    else:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            fetched = await asyncio.gather(*(grab(client, r) for r in rows), return_exceptions=True)

    arrays, metas = [], []
    for item in fetched:
        if isinstance(item, Exception):
            log.warning("cutout failed: %r", item)
            continue
        row, content = item
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                with fits.open(io.BytesIO(content)) as hdul:
                    hdu = hdul["IMAGE"] if "IMAGE" in hdul else hdul[1]
                    data = hdu.data.astype(np.float32)
                    # IRSA flag bits are not all "bad pixel"; report the clean fraction, mask only non-finite values.
                    quality = 100.0
                    if "FLAGS" in hdul and hdul["FLAGS"].data is not None:
                        quality = 100.0 * float((hdul["FLAGS"].data == 0).mean())
                    wcs = WCS(hdu.header, naxis=2)
                    reproj, _ = reproject_interp((data, wcs), out_wcs, shape_out=(size, size))
            arrays.append(reproj)
            metas.append((row[0].split("/")[-1].split("?")[0], row[1], _array_center_um(row[2]), int(row[2][-1]) if row[2][-1].isdigit() else 0, quality))
        except Exception as e:  # skip unreadable frames, keep the rest
            log.warning("frame parse failed: %r", e)

    if not arrays:
        raise RuntimeError("IRSA found images but no cutout could be read (%d requested)" % len(rows))
    vmin, vmax = stretch_limits(arrays)
    tl = Timelapse("irsa", ra, dec, fov_arcmin, size, notes=notes)
    for i, (a, (oid, mjd, wl, det, q)) in enumerate(zip(arrays, metas)):
        tl.frames.append(Frame(i, oid, mjd, mjd_to_date(mjd) if mjd else "", wl, det, q, render_png_b64(a, vmin, vmax)))
    return tl


async def build_timelapse(
    tap_url: str,
    ra: float,
    dec: float,
    fov_arcmin: float,
    detector: int | None,
    max_frames: int,
    allow_synthetic: bool = True,
) -> Timelapse:
    try:
        return await build_from_irsa(tap_url or DEFAULT_TAP_URL, ra, dec, fov_arcmin, detector, max_frames)
    except Exception as e:
        log.warning("IRSA time-lapse failed: %r", e)
        if not allow_synthetic:
            raise
        tl = build_synthetic(ra, dec, fov_arcmin, min(max_frames, 12))
        tl.notes.append(f"IRSA error: {type(e).__name__}: {' '.join(str(e).split())[:240]}")
        return tl
    
    def aperture_flux(data: np.ndarray, r_px: float = 2.0) -> tuple[float | None, float | None]:    n_y, n_x = data.shape
    cy, cx = (n_y - 1) / 2.0, (n_x - 1) / 2.0
    yy, xx = np.mgrid[0:n_y, 0:n_x]
    rr = np.hypot(xx - cx, yy - cy)
    ok = np.isfinite(data)
    ap = (rr <= r_px) & ok
    ann = (rr >= r_px + 2) & (rr <= r_px + 6) & ok
    if ap.sum() < 3 or ann.sum() < 10:
        return None, None
    bg = float(np.median(data[ann]))
    sigma = 1.4826 * float(np.median(np.abs(data[ann] - bg)))
    return float(np.sum(data[ap] - bg)), sigma * float(np.sqrt(ap.sum()))
