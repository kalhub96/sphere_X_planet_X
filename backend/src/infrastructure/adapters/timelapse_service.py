"""Multi-epoch SPHEREx cutout time-lapse builder.

Real path: IRSA SIA2 (pyvo) -> FITS cutouts -> reproject to a common TAN grid -> shared-stretch PNG frames.
Fallback: deterministic synthetic field (flagged ``source="synthetic"``) when IRSA is unreachable.
Update for new data releases by changing ``IRSA_SPHEREX_COLLECTION`` (e.g. ``spherex_qr2``).
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
def _search_irsa(sia2_url: str, collection: str, ra: float, dec: float, radius_deg: float):
    import pyvo

    svc = pyvo.dal.sia2.SIA2Service(sia2_url)
    return svc.search(pos=(ra, dec, radius_deg), collection=collection, maxrec=400)


def _cutout_url(access_url: str, ra: float, dec: float, fov_deg: float) -> str:
    sep = "&" if "?" in access_url else "?"
    return f"{access_url}{sep}center={ra},{dec}deg&size={fov_deg}deg"


async def build_from_irsa(
    sia2_url: str,
    collection: str,
    ra: float,
    dec: float,
    fov_arcmin: float,
    detector: int | None,
    max_frames: int,
    timeout: float = 45.0,
) -> Timelapse:
    import httpx
    from reproject import reproject_interp
    from astropy.io import fits

    loop = asyncio.get_running_loop()
    fov_deg = fov_arcmin / 60.0
    results = await asyncio.wait_for(
        loop.run_in_executor(None, _search_irsa, sia2_url, collection, ra, dec, fov_deg / 2), timeout
    )
    rows = [r for r in results if getattr(r, "access_url", None)]
    if not rows:
        raise RuntimeError("IRSA returned no SPHEREx observations for this position")
    rows.sort(key=lambda r: float(getattr(r, "t_min", 0.0) or 0.0))
    if len(rows) > max_frames:  # thin evenly across time
        idx = np.linspace(0, len(rows) - 1, max_frames).round().astype(int)
        rows = [rows[i] for i in idx]

    size = size_for_fov(fov_arcmin)
    out_wcs = target_wcs(ra, dec, size)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        async def grab(row):
            r = await client.get(_cutout_url(str(row.access_url), ra, dec, fov_deg))
            r.raise_for_status()
            return row, r.content

        fetched = await asyncio.gather(*(grab(r) for r in rows), return_exceptions=True)

    arrays, metas = [], []
    for item in fetched:
        if isinstance(item, Exception):
            log.warning("cutout failed: %s", item)
            continue
        row, content = item
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                with fits.open(io.BytesIO(content)) as hdul:
                    hdu = hdul["IMAGE"] if "IMAGE" in hdul else hdul[1]
                    det = int(hdul[0].header.get("DETECTOR", hdu.header.get("DETECTOR", 0)) or 0)
                    if detector and det and det != detector:
                        continue
                    flags = hdul["FLAGS"].data if "FLAGS" in hdul else None
                    data = hdu.data.astype(np.float32)
                    if flags is not None:
                        data = np.where(flags != 0, np.nan, data)
                    quality = 100.0 * float(np.isfinite(data).mean())
                    wcs = WCS(hdu.header, naxis=2)
                    reproj, _ = reproject_interp((data, wcs), out_wcs, shape_out=(size, size))
            t_min = float(getattr(row, "t_min", 0.0) or 0.0)
            em = getattr(row, "energy_bounds", None)
            wl = float(np.mean(em) * 1e6) if em is not None and np.size(em) == 2 and np.mean(em) < 1e-3 else 0.0
            arrays.append(reproj)
            metas.append((str(getattr(row, "obs_id", "")), t_min, wl, det, quality))
        except Exception as e:  # skip unreadable frames, keep the rest
            log.warning("frame parse failed: %s", e)

    if not arrays:
        raise RuntimeError("No usable SPHEREx cutouts were returned")
    vmin, vmax = stretch_limits(arrays)
    tl = Timelapse("irsa", ra, dec, fov_arcmin, size)
    for i, (a, (oid, mjd, wl, det, q)) in enumerate(zip(arrays, metas)):
        tl.frames.append(Frame(i, oid, mjd, mjd_to_date(mjd) if mjd else "", wl, det, q, render_png_b64(a, vmin, vmax)))
    return tl


async def build_timelapse(
    sia2_url: str,
    collection: str,
    ra: float,
    dec: float,
    fov_arcmin: float,
    detector: int | None,
    max_frames: int,
    allow_synthetic: bool = True,
) -> Timelapse:
    try:
        return await build_from_irsa(sia2_url, collection, ra, dec, fov_arcmin, detector, max_frames)
    except Exception as e:
        log.warning("IRSA time-lapse failed (%s)", e)
        if not allow_synthetic:
            raise
        tl = build_synthetic(ra, dec, fov_arcmin, min(max_frames, 12))
        tl.notes.append(f"IRSA error: {str(e).strip().splitlines()[0][:160]}")
        return tl
