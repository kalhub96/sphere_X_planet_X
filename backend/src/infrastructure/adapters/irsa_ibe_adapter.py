"""IRSA IBE adapter to resolve obs_id -> fits_url and fetch cutouts with physical synthesis fallback."""

from __future__ import annotations

import asyncio
import io
import math
from typing import Final

import httpx
import numpy as np
from astropy.wcs import WCS
from sqlalchemy import select

from ...domain.entities.fits_image import FITSImage
from ...domain.entities.observation import is_simulated_obs_id
from ...domain.exceptions import IRSAError, NoDataError
from ..db.models import ObservationModel
from ..db.session import create_tables, get_session_factory
from .astropy_fits_adapter import AstropyFITSAdapter
from .redis_cache import RedisCache

FITS_CACHE_TTL: Final = 86_400


class IRSAIBEAdapter:
    """Resolve ``obs_id -> fits_url`` from SQLite and retrieve the cutout."""

    def __init__(
        self,
        database_url: str = "sqlite+aiosqlite:///./data/skytrace.db",
        timeout: float = 60.0,
        cache: RedisCache | None = None,
    ) -> None:
        self._database_url = database_url
        self._timeout = timeout
        self._parser = AstropyFITSAdapter()
        self._cache = cache or RedisCache("redis://localhost:6379")

    async def fetch(self, obs_id: str, band: int = 50) -> FITSImage:
        """Return the cutout for one observation.

        Real SPHEREx data only. The one exception is an observation ID minted by
        the user's explicit Demo mode (see ``is_simulated_obs_id``), which yields
        a frame flagged ``is_simulated=True``. A failed download is reported as
        an error; it is never replaced by invented pixels.
        """
        if is_simulated_obs_id(obs_id):
            return self._synthesize_calibrated_cutout(obs_id, band)

        cache_key = f"fits-cutout:{obs_id}:{band}"
        cached = await self._cache.get_bytes(cache_key)
        if cached is not None:
            try:
                return self._parser.parse(cached, obs_id=obs_id)
            except Exception:
                pass

        fits_url = await self._fits_url_for(obs_id)
        if not (fits_url.startswith("http://") or fits_url.startswith("https://")):
            raise NoDataError(f"No download URL is known for SPHEREx observation {obs_id}.")

        last_error: Exception | None = None
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                    response = await client.get(fits_url)
                if response.status_code == 200 and len(response.content) > 1000:
                    await self._cache.set_bytes(cache_key, response.content, ttl=FITS_CACHE_TTL)
                    return self._parser.parse(response.content, obs_id=obs_id)
                last_error = IRSAError(f"IRSA answered HTTP {response.status_code} for {obs_id}")
                if response.status_code not in (502, 503, 504):
                    break
            except Exception as error:  # network error, timeout, unreadable FITS
                last_error = error
            if attempt < 1:
                await asyncio.sleep(0.5)
        raise IRSAError(
            f"Could not download the SPHEREx cutout for {obs_id} from IRSA: {last_error}"
        ) from last_error

    async def _fits_url_for(self, obs_id: str) -> str:
        try:
            factory = get_session_factory()
            if factory is None:
                await create_tables(self._database_url)
                factory = get_session_factory()
            if factory:
                async with factory() as session:
                    row = (
                        await session.execute(
                            select(ObservationModel.fits_url).where(ObservationModel.id == obs_id)
                        )
                    ).scalar_one_or_none()
                    if row:
                        return str(row)
        except Exception:
            pass
        return obs_id

    def _synthesize_calibrated_cutout(self, obs_id: str, band: int) -> FITSImage:
        """OFFLINE DEMO ONLY: build a synthetic frame (noise + scripted sources).

        The result carries ``is_simulated=True``. It is NOT SPHEREx data.
        """
        ra = 133.7951
        dec = -7.2451
        pass_num = 1
        b_idx = band

        parts = obs_id.split("_")
        for i, p in enumerate(parts):
            if p.startswith("pass"):
                try:
                    pass_num = int(p.replace("pass", ""))
                except Exception:
                    pass
            elif p.startswith("ep"):
                try:
                    pass_num = int(p.replace("ep", ""))
                except Exception:
                    pass
            elif p.startswith("b") and p[1:].isdigit():
                try:
                    b_idx = int(p[1:])
                except Exception:
                    pass
            elif len(parts) >= 4 and i == 2:
                try:
                    ra = float(p)
                    dec = float(parts[i + 1])
                except Exception:
                    pass

        epoch_mjd = 60810.0 + (pass_num - 1) * 183.0
        dt_years = (pass_num - 1) * 0.50

        pix_scale_deg = 6.2 / 3600.0
        w = WCS(naxis=2)
        w.wcs.crpix = [64.0, 64.0]
        w.wcs.cdelt = [-pix_scale_deg, pix_scale_deg]
        w.wcs.crval = [ra, dec]
        w.wcs.ctype = ["RA---TAN", "DEC--TAN"]

        np.random.seed(int(abs(ra * 1000 + dec * 100 + pass_num * 17 + b_idx) % 2**31))
        data = np.random.normal(loc=12.0, scale=1.8, size=(128, 128)).astype(np.float32)
        variance = np.full_like(data, 3.24, dtype=np.float32)
        flags = np.zeros_like(data, dtype=np.int16)

        cr_indices = np.random.randint(0, 128, size=(6, 2))
        for y, x in cr_indices:
            flags[y, x] = 1
            data[y, x] += np.random.uniform(150.0, 400.0)

        background_sources = [
            (25, 30, 95.0),
            (102, 22, 140.0),
            (35, 98, 110.0),
            (88, 105, 80.0),
            (15, 75, 60.0),
        ]
        for sx, sy, flux in background_sources:
            for dx in range(-3, 4):
                for dy in range(-3, 4):
                    d2 = dx * dx + dy * dy
                    if 0 <= sy + dy < 128 and 0 <= sx + dx < 128:
                        data[sy + dy, sx + dx] += flux * math.exp(-d2 / (2 * 1.3**2))

        # 1. Barnard's Star (proper motion 10.37"/yr due north = 1.67 px/yr)
        if abs(ra - 269.4521) < 0.05 and abs(dec - 4.6934) < 0.05:
            base_x = 64.0
            base_y = 64.0 + (dt_years * 1.67)
            star_flux = 550.0 if b_idx < 34 else 380.0
            self._render_gaussian_source(data, base_x, base_y, star_flux, fwhm=2.3)

        # 2. Epsilon Indi B (co-moving binary pair SE)
        elif abs(ra - 331.0438) < 0.05 and abs(dec - (-56.7828)) < 0.05:
            bx = 64.0 + (dt_years * 0.54)
            by = 64.0 - (dt_years * 0.54)
            wl = 0.75 * ((5.0 / 0.75) ** (b_idx / 101.0))
            is_methane_dip = (1.55 <= wl <= 1.70) or (2.20 <= wl <= 2.40)
            flux = 70.0 if is_methane_dip else 240.0
            self._render_gaussian_source(data, bx, by, flux, fwhm=2.4)

        # 3. WISE 0855 (thermal IR peak in D5/D6, moving westward)
        elif abs(ra - 133.7951) < 0.05 and abs(dec - (-7.2451)) < 0.05:
            bx = 64.0 - (dt_years * 1.31)
            by = 64.0 + (dt_years * 0.15)
            if b_idx < 34:
                dwarf_flux = 0.0
            elif b_idx < 68:
                dwarf_flux = 30.0
            else:
                dwarf_flux = 340.0
            if dwarf_flux > 0:
                self._render_gaussian_source(data, bx, by, dwarf_flux, fwhm=2.2)

        # 4. RW Aurigae (variable star, dramatic flux changes)
        elif abs(ra - 76.9564) < 0.05 and abs(dec - 30.4014) < 0.05:
            bx, by = 64.0, 64.0
            flux_cycle = [480.0, 110.0, 390.0]
            star_flux = flux_cycle[(pass_num - 1) % len(flux_cycle)]
            self._render_gaussian_source(data, bx, by, star_flux, fwhm=2.2)

        # 5. R Draconis (Mira variable, pulsation)
        elif abs(ra - 248.1633) < 0.05 and abs(dec - 66.7539) < 0.05:
            bx, by = 64.0, 64.0
            phase = (epoch_mjd - 60780.0) / 245.5 * 2 * math.pi
            pulsation_factor = 0.5 + 0.5 * math.sin(phase)
            mira_flux = 150.0 + 400.0 * pulsation_factor
            self._render_gaussian_source(data, bx, by, mira_flux, fwhm=2.2)

        else:
            cand_x = 64.0 + (pass_num - 1) * 3.5
            cand_y = 64.0 + (pass_num - 1) * 1.5
            self._render_gaussian_source(data, cand_x, cand_y, 300.0, fwhm=2.2)

        bad_mask = flags != 0
        data_masked = np.where(bad_mask, np.nan, data)
        clean_pct = 100.0 * float((~bad_mask).sum()) / max(bad_mask.size, 1)

        wl = round(0.75 * ((5.0 / 0.75) ** (b_idx / 101.0)), 4)
        return FITSImage(
            data=data_masked,
            variance=variance,
            flags=flags,
            wcs=w,
            epoch_mjd=epoch_mjd,
            wavelength_um=wl,
            band_index=b_idx,
            obs_id=obs_id,
            quality_pct=round(clean_pct, 1),
            is_simulated=True,
        )

    def _render_gaussian_source(self, data: np.ndarray, cx: float, cy: float, flux: float, fwhm: float = 2.2) -> None:
        sigma = fwhm / 2.355
        ix, iy = int(round(cx)), int(round(cy))
        r = int(math.ceil(3 * sigma))
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                px, py = ix + dx, iy + dy
                if 0 <= py < data.shape[0] and 0 <= px < data.shape[1]:
                    dist2 = (px - cx)**2 + (py - cy)**2
                    data[py, px] += flux * math.exp(-dist2 / (2 * sigma**2))
