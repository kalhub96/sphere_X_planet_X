"""Numpy and Astropy image processing adapter for WCS alignment, coaddition, WiseView stretch, and false color."""

from __future__ import annotations

import asyncio
import base64
import io
import math
import warnings
from typing import Final

import numpy as np
from astropy.stats import sigma_clipped_stats
from astropy.visualization import (
    AsinhStretch,
    LogStretch,
    PercentileInterval,
    ZScaleInterval,
    make_lupton_rgb,
)
from astropy.wcs import WCS
from photutils.detection import DAOStarFinder
from PIL import Image
from reproject import reproject_interp

from ...domain.entities.candidate import Candidate
from ...domain.entities.fits_image import FITSImage
from ...domain.services.artifact_checker import ArtifactChecker


class NumpyImageProcessor:
    """CPU-bound scientific image operations executed in an executor loop."""

    async def align(self, image_a: FITSImage, image_b: FITSImage) -> tuple[FITSImage, FITSImage]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._align_sync, image_a, image_b)

    def _align_sync(self, image_a: FITSImage, image_b: FITSImage) -> tuple[FITSImage, FITSImage]:
        is_same_grid = False
        if image_a.shape == image_b.shape and hasattr(image_a.wcs, "wcs") and hasattr(image_b.wcs, "wcs"):
            if np.allclose(image_a.wcs.wcs.crval, image_b.wcs.wcs.crval) and np.allclose(image_a.wcs.wcs.crpix, image_b.wcs.wcs.crpix):
                is_same_grid = True

        if is_same_grid:
            data_b_aligned = image_b.data
            var_b_reproj = image_b.variance
        else:
            try:
                data_b_reproj, footprint = reproject_interp(
                    (np.nan_to_num(image_b.data, nan=0.0), image_b.wcs),
                    image_a.wcs,
                    shape_out=image_a.shape,
                )
                var_b_reproj, _ = reproject_interp(
                    (image_b.variance, image_b.wcs),
                    image_a.wcs,
                    shape_out=image_a.shape,
                )
                data_b_aligned = np.where(footprint > 0, data_b_reproj, np.nan)
            except Exception:
                data_b_aligned = image_b.data
                var_b_reproj = image_b.variance

        # Ensure shapes match image_a exactly
        if data_b_aligned.shape != image_a.shape:
            data_b_aligned = np.resize(data_b_aligned, image_a.shape)
        if var_b_reproj.shape != image_a.shape:
            var_b_reproj = np.resize(var_b_reproj, image_a.shape)
        flags_b = image_b.flags
        if flags_b.shape != image_a.shape:
            flags_b = np.resize(flags_b, image_a.shape)

        image_b_aligned = FITSImage(
            data=data_b_aligned.astype(np.float32),
            variance=var_b_reproj.astype(np.float32),
            flags=flags_b,
            wcs=image_a.wcs,
            epoch_mjd=image_b.epoch_mjd,
            wavelength_um=image_b.wavelength_um,
            band_index=image_b.band_index,
            obs_id=image_b.obs_id,
            quality_pct=image_b.quality_pct,
            is_simulated=image_b.is_simulated,
        )
        return image_a, image_b_aligned

    async def coadd_detector_array(self, images: list[FITSImage]) -> FITSImage:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._coadd_sync, images)

    def _coadd_sync(self, images: list[FITSImage]) -> FITSImage:
        if not images:
            raise ValueError("No images to coadd")
        if len(images) == 1:
            return images[0]

        ref = images[0]
        stack = []
        var_stack = []
        flags_combined = np.zeros_like(ref.flags, dtype=np.int16)

        for img in images:
            is_same_grid = False
            if img.shape == ref.shape and hasattr(img.wcs, "wcs") and hasattr(ref.wcs, "wcs"):
                if np.allclose(img.wcs.wcs.crval, ref.wcs.wcs.crval) and np.allclose(img.wcs.wcs.crpix, ref.wcs.wcs.crpix):
                    is_same_grid = True

            if is_same_grid:
                reproj_data = img.data
                reproj_var = img.variance
            else:
                try:
                    reproj_data, footprint = reproject_interp(
                        (np.nan_to_num(img.data, nan=0.0), img.wcs),
                        ref.wcs,
                        shape_out=ref.shape,
                    )
                    reproj_var, _ = reproject_interp(
                        (img.variance, img.wcs),
                        ref.wcs,
                        shape_out=ref.shape,
                    )
                    reproj_data = np.where(footprint > 0, reproj_data, np.nan)
                except Exception:
                    reproj_data = img.data
                    reproj_var = img.variance

            if reproj_data.shape != ref.shape:
                reproj_data = np.resize(reproj_data, ref.shape)
            if reproj_var.shape != ref.shape:
                reproj_var = np.resize(reproj_var, ref.shape)

            # Mask non-zero flags as nan
            clean_data = np.where(img.flags != 0, np.nan, reproj_data) if img.flags.shape == reproj_data.shape else reproj_data
            stack.append(clean_data)
            var_stack.append(reproj_var)
            if img.flags.shape == flags_combined.shape:
                flags_combined |= img.flags

        stack_arr = np.array(stack, dtype=np.float32)
        # Median coadding per skills.md
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            coadded_data = np.nanmedian(stack_arr, axis=0).astype(np.float32)
            # Fill pixels that had no valid exposure
            nan_mask = np.isnan(coadded_data)
            if np.any(nan_mask):
                # Pixels with no valid exposure take the image's own median level.
                finite = coadded_data[~nan_mask]
                coadded_data[nan_mask] = float(np.median(finite)) if finite.size else 0.0

        coadded_var = (np.mean(var_stack, axis=0) / len(images)).astype(np.float32)

        bad_mask = np.isnan(coadded_data) | (flags_combined != 0)
        quality_pct = 100.0 * float((~bad_mask).sum()) / max(bad_mask.size, 1)

        mean_wl = float(np.mean([img.wavelength_um for img in images]))

        return FITSImage(
            data=coadded_data,
            variance=coadded_var,
            flags=flags_combined,
            wcs=ref.wcs,
            epoch_mjd=ref.epoch_mjd,
            wavelength_um=round(mean_wl, 4),
            band_index=ref.band_index,
            obs_id=f"coadd_{ref.obs_id}",
            quality_pct=round(quality_pct, 1),
            is_simulated=any(img.is_simulated for img in images),
        )

    async def subtract(self, image_a: FITSImage, image_b: FITSImage) -> tuple[np.ndarray, np.ndarray]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._subtract_sync, image_a, image_b)

    def _subtract_sync(self, image_a: FITSImage, image_b: FITSImage) -> tuple[np.ndarray, np.ndarray]:
        a_clean = np.nan_to_num(image_a.data, nan=0.0)
        b_clean = np.nan_to_num(image_b.data, nan=0.0)
        a_var = np.nan_to_num(image_a.variance, nan=1.0)
        b_var = np.nan_to_num(image_b.variance, nan=1.0)

        # Guarantee identical dimensions
        if a_clean.shape != b_clean.shape:
            min_r = min(a_clean.shape[0], b_clean.shape[0])
            min_c = min(a_clean.shape[1], b_clean.shape[1])
            a_clean = a_clean[:min_r, :min_c]
            b_clean = b_clean[:min_r, :min_c]
            a_var = a_var[:min_r, :min_c]
            b_var = b_var[:min_r, :min_c]

        difference = b_clean - a_clean  # positive means epoch B is brighter
        sigma_diff = np.sqrt(a_var + b_var)
        sigma_diff = np.where(sigma_diff <= 0, 1e-6, sigma_diff)
        snr_map = difference / sigma_diff
        return difference, snr_map

    async def detect_sources(self, snr_map: np.ndarray, wcs: WCS | None = None, sigma_threshold: float = 4.5) -> list[Candidate]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._detect_sync, snr_map, wcs, sigma_threshold)

    def _detect_sync(self, snr_map: np.ndarray, wcs: WCS | None, sigma_threshold: float) -> list[Candidate]:
        clean_snr = np.nan_to_num(snr_map, nan=0.0)
        mean, median, std = sigma_clipped_stats(clean_snr, sigma=3.0)

        daofind = DAOStarFinder(fwhm=2.2, threshold=sigma_threshold * max(std, 0.5))
        sources = daofind(clean_snr - median)

        candidates = []
        if sources is not None and len(sources) > 0:
            for row in sources:
                x_val = float(row["x_centroid"] if "x_centroid" in row.colnames else row["xcentroid"])
                y_val = float(row["y_centroid"] if "y_centroid" in row.colnames else row["ycentroid"])
                x, y = int(round(x_val)), int(round(y_val))
                if y >= clean_snr.shape[0] or x >= clean_snr.shape[1] or x < 0 or y < 0:
                    continue
                snr = float(clean_snr[y, x])
                if abs(snr) < sigma_threshold:
                    continue

                fwhm = float(row.get("fwhm", 2.2)) if "fwhm" in row.colnames else 2.2
                is_art, art_prob, _ = ArtifactChecker.is_artifact(
                    pixel_x=float(x), pixel_y=float(y),
                    image_shape=clean_snr.shape, fwhm_pixels=fwhm,
                )
                conf = min(max(abs(snr) / 18.0, 0.1) * (1.0 - 0.5 * art_prob), 0.99)

                ra, dec = 0.0, 0.0
                if wcs:
                    try:
                        sky = wcs.pixel_to_world(x, y)
                        ra, dec = float(sky.ra.deg), float(sky.dec.deg)
                    except Exception:
                        pass

                from ...domain.entities.candidate import CandidateClassification
                cand_type = (
                    CandidateClassification.FAST_MOVING
                    if abs(snr) > 12.0
                    else (CandidateClassification.SLOW_MOVING if abs(snr) > 7.0 else CandidateClassification.VARIABLE_STAR)
                )

                candidates.append(
                    Candidate(
                        id=f"cand_{int(abs(ra*10000))}_{int(abs(dec*10000))}_{x}_{y}",
                        ra=round(ra, 6),
                        dec=round(dec, 6),
                        pixel_x=int(x),
                        pixel_y=int(y),
                        snr_change=round(snr, 2),
                        delta_flux=round(snr * max(std, 0.5), 3),
                        delta_flux_sigma=round(max(std, 0.5), 3),
                        motion_arcsec=round(abs(snr) * 0.45, 2),
                        artifact_probability=round(float(art_prob), 3),
                        confidence_score=round(conf, 3),
                        snr=round(abs(snr), 2),
                        confidence=round(conf, 3),
                        classification=cand_type,
                        motion_arcsec_yr=round(abs(snr) * 0.45, 2),
                        position_angle_deg=45.0,
                        is_known_solar_system=False,
                        cross_matches=[],
                    )
                )

        return candidates

    def extract_wcs_header(self, wcs: WCS) -> dict:
        """Serialize real FITS WCS keywords for frontend astrometric mapping."""
        crpix = [64.0, 64.0]
        crval = [0.0, 0.0]
        cd = [[-0.001722, 0.0], [0.0, 0.001722]]
        pixscale = 6.2

        if hasattr(wcs, "wcs") and wcs.wcs is not None:
            try:
                crpix = [float(wcs.wcs.crpix[0]), float(wcs.wcs.crpix[1])]
                crval = [float(wcs.wcs.crval[0]), float(wcs.wcs.crval[1])]
                if hasattr(wcs.wcs, "cd") and wcs.wcs.cd is not None and wcs.wcs.cd.shape == (2, 2):
                    cd = [
                        [float(wcs.wcs.cd[0, 0]), float(wcs.wcs.cd[0, 1])],
                        [float(wcs.wcs.cd[1, 0]), float(wcs.wcs.cd[1, 1])],
                    ]
                elif hasattr(wcs.wcs, "cdelt") and wcs.wcs.cdelt is not None:
                    cd = [
                        [float(wcs.wcs.cdelt[0]), 0.0],
                        [0.0, float(wcs.wcs.cdelt[1])],
                    ]
                pixscale = float(abs(cd[0][0]) * 3600.0)
            except Exception:
                pass

        return {
            "crpix1": crpix[0],
            "crpix2": crpix[1],
            "crval1": crval[0],
            "crval2": crval[1],
            "cd1_1": cd[0][0],
            "cd1_2": cd[0][1],
            "cd2_1": cd[1][0],
            "cd2_2": cd[1][1],
            "pixel_scale_arcsec": round(pixscale, 3),
        }

    async def render_tile(self, image: FITSImage, stretch: str = "asinh", scaling: str | None = None) -> str:
        loop = asyncio.get_event_loop()
        actual_stretch = scaling if scaling is not None else stretch
        return await loop.run_in_executor(None, self._render_tile_sync, image.data, actual_stretch, False)

    async def render_diff_tile(self, diff_arr: np.ndarray, colormap: str = "diverging") -> str:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._render_tile_sync, diff_arr, "linear", True)

    def _render_tile_sync(self, data: np.ndarray, stretch: str, is_diff: bool) -> str:
        clean = np.nan_to_num(data, nan=0.0)

        if is_diff:
            # Diverging colormap: negative is blue, positive is red
            clip_val = max(float(np.percentile(np.abs(clean), 99.0)), 1e-3)
            norm = np.clip(clean / clip_val, -1.0, 1.0)
            r = np.clip((norm * 255).astype(np.int32), 0, 255).astype(np.uint8)
            b = np.clip((-norm * 255).astype(np.int32), 0, 255).astype(np.uint8)
            g = np.full_like(r, 25)
            rgb = np.stack([r, g, b], axis=-1)
            img = Image.fromarray(rgb, mode="RGB")
        else:
            if stretch == "asinh":
                try:
                    interval = PercentileInterval(99.5)
                    vmin, vmax = interval.get_limits(clean)
                    norm = np.clip((clean - vmin) / max(vmax - vmin, 1e-5), 0.0, 1.0)
                    asinh = AsinhStretch(a=0.1)
                    stretched = asinh(norm)
                except Exception:
                    stretched = np.clip((clean - np.min(clean)) / max(np.ptp(clean), 1e-5), 0.0, 1.0)
            elif stretch == "zscale":
                try:
                    interval = ZScaleInterval()
                    vmin, vmax = interval.get_limits(clean)
                    stretched = np.clip((clean - vmin) / max(vmax - vmin, 1e-5), 0.0, 1.0)
                except Exception:
                    stretched = np.clip((clean - np.min(clean)) / max(np.ptp(clean), 1e-5), 0.0, 1.0)
            elif stretch == "log":
                try:
                    pos = np.clip(clean - np.percentile(clean, 1), 0.0, None)
                    log_s = LogStretch()
                    stretched = log_s(pos / max(np.percentile(pos, 99.5), 1e-5))
                except Exception:
                    stretched = np.clip((clean - np.min(clean)) / max(np.ptp(clean), 1e-5), 0.0, 1.0)
            else:
                vmin, vmax = float(np.percentile(clean, 1)), float(np.percentile(clean, 99))
                stretched = np.clip((clean - vmin) / max(vmax - vmin, 1e-5), 0.0, 1.0)

            uint8 = (stretched * 255).astype(np.uint8)
            img = Image.fromarray(uint8, mode="L")

        img = img.resize((512, 512), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    async def render_false_color(self, red_img: FITSImage, green_img: FITSImage, blue_img: FITSImage) -> str:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._render_false_color_sync, red_img.data, green_img.data, blue_img.data)

    def _render_false_color_sync(self, r_data: np.ndarray, g_data: np.ndarray, b_data: np.ndarray) -> str:
        def stretch_channel(d: np.ndarray) -> np.ndarray:
            clean = np.nan_to_num(d, nan=0.0)
            interval = PercentileInterval(99.0)
            vmin, vmax = interval.get_limits(clean)
            norm = np.clip((clean - vmin) / max(vmax - vmin, 1e-5), 0.0, 1.0)
            return (AsinhStretch(a=0.1)(norm) * 255).astype(np.uint8)

        r = stretch_channel(r_data)
        g = stretch_channel(g_data)
        b = stretch_channel(b_data)

        min_h = min(r.shape[0], g.shape[0], b.shape[0])
        min_w = min(r.shape[1], g.shape[1], b.shape[1])
        r = r[:min_h, :min_w]
        g = g[:min_h, :min_w]
        b = b[:min_h, :min_w]

        rgb = np.stack([r, g, b], axis=-1)
        img = Image.fromarray(rgb, mode="RGB").resize((512, 512), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    async def combine_epochs(
        self, plus: list[FITSImage], minus: list[FITSImage]
    ) -> tuple[str, str]:
        """Add and subtract epochs the user picked.

        Returns ``(png_base64, kind)``:
          * only ``plus``  -> median stack of those epochs, kind ``"stack"``;
          * ``plus`` and ``minus`` -> (stack of plus) - (stack of minus) as a
            signal-to-noise difference image, kind ``"difference"``. Red means
            brighter in the plus set, blue brighter in the minus set.
        """
        if not plus:
            raise ValueError("At least one epoch is needed in the plus set")
        stacked_plus = await self.coadd_detector_array(plus)
        if not minus:
            return await self.render_tile(stacked_plus, stretch="asinh"), "stack"
        stacked_minus = await self.coadd_detector_array(minus)
        # Put the minus stack on the plus stack's pixel grid, then B - A = plus - minus.
        _, plus_aligned = await self.align(stacked_minus, stacked_plus)
        _, snr_map = await self.subtract(stacked_minus, plus_aligned)
        return await self.render_diff_tile(snr_map, colormap="diverging"), "difference"

    async def render_rgb(self, red: FITSImage, green: FITSImage, blue: FITSImage) -> str:
        """Three-band false-colour composite (Lupton asinh), all channels on one grid."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._render_rgb_sync, red.data, green.data, blue.data
        )

    def _render_rgb_sync(self, r_data: np.ndarray, g_data: np.ndarray, b_data: np.ndarray) -> str:
        shape = (
            min(r_data.shape[0], g_data.shape[0], b_data.shape[0]),
            min(r_data.shape[1], g_data.shape[1], b_data.shape[1]),
        )
        channels = []
        for data in (r_data, g_data, b_data):
            clean = np.nan_to_num(data[: shape[0], : shape[1]], nan=np.nan)
            background = float(np.nanmedian(clean)) if np.isfinite(clean).any() else 0.0
            channels.append(np.nan_to_num(clean - background, nan=0.0))

        # One shared stretch for all three channels keeps colours physically meaningful
        # (a red source really is brighter at the long-wavelength band).
        combined = np.concatenate([np.clip(c, 0, None).ravel() for c in channels])
        scale = float(np.percentile(combined, 99.5)) if combined.size else 1.0
        scale = max(scale, 1e-6)
        rgb = make_lupton_rgb(
            channels[0] / scale,
            channels[1] / scale,
            channels[2] / scale,
            minimum=0.0,
            stretch=0.5,
            Q=8,
        )
        img = Image.fromarray(rgb, mode="RGB").resize((512, 512), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

