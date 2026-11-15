import asyncio
import math
from datetime import date
from fastapi import APIRouter, Depends, Query, HTTPException
from ..schemas import EpochsResponse, EpochFrame, WCSHeader, FlagSummary, CandidateResponse
from src.infrastructure.api.dependencies import (
    get_sia_adapter,
    get_ibe_adapter,
    get_processor,
    get_cache,
    get_candidate_repo,
)
from src.infrastructure.adapters.irsa_sia_adapter import IRSASIAAdapter, DETECTOR_ARRAY_BANDS
from src.infrastructure.adapters.irsa_ibe_adapter import IRSAIBEAdapter
from src.infrastructure.adapters.numpy_processor import NumpyImageProcessor
from src.infrastructure.adapters.redis_cache import RedisCache
from src.infrastructure.adapters.sqlite_candidate_repo import SQLiteCandidateRepository
from src.domain.entities.fits_image import FITSImage
from src.domain.exceptions import IRSAError, NoDataError

router = APIRouter(prefix="/api/v1/epochs", tags=["epochs"])

@router.get("", response_model=EpochsResponse)
async def get_multi_epoch_flipbook(
    ra: float = Query(..., ge=0.0, le=360.0, description="Right Ascension in degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="Declination in degrees"),
    fov: float = Query(0.08, ge=0.01, le=1.0, description="Field of View in degrees"),
    array: str | None = Query(None, description="SPHEREx Detector Array (D1, D2, D3, D4, D5, D6)"),
    band: int | None = Query(None, ge=0, le=101, description="Single SPHEREx band index (0-101)"),
    stretch: str = Query("asinh", description="Image stretch: asinh, zscale, log, linear"),
    sia: IRSASIAAdapter = Depends(get_sia_adapter),
    ibe: IRSAIBEAdapter = Depends(get_ibe_adapter),
    processor: NumpyImageProcessor = Depends(get_processor),
    candidate_repo: SQLiteCandidateRepository = Depends(get_candidate_repo),
    cache: RedisCache = Depends(get_cache),
):
    # Check cache for fast sub-100ms response
    cache_key = f"epochs_flipbook:{ra:.4f}:{dec:.4f}:{fov:.4f}:{array}:{band}:{stretch}"
    cached = await cache.get(cache_key)
    if cached:
        return EpochsResponse(**cached)

    try:
        # 1. Search multi-epoch observations
        observations = await sia.search(ra=ra, dec=dec, radius_deg=fov / 2.0, band=band, array=array)
        if not observations:
            raise HTTPException(status_code=404, detail="No SPHEREx observations found for given coordinates")

        # 2. Cluster observations into ~6-month survey epochs (MJD clusters within 15 days)
        sorted_obs = sorted(observations, key=lambda o: o.epoch_mjd)
        epoch_clusters: list[list] = []
        for obs in sorted_obs:
            placed = False
            for cluster in epoch_clusters:
                mean_mjd = sum(o.epoch_mjd for o in cluster) / len(cluster)
                if abs(obs.epoch_mjd - mean_mjd) <= 15.0:
                    cluster.append(obs)
                    placed = True
                    break
            if not placed:
                epoch_clusters.append([obs])

        # 3. Process each epoch pass
        epoch_frames: list[EpochFrame] = []
        epoch_images: list[FITSImage] = []

        for ep_idx, cluster in enumerate(epoch_clusters):
            # If detector array coadding is requested (e.g. D1..D6), coadd all channels in this detector
            if array and array in DETECTOR_ARRAY_BANDS:
                bands_to_fetch = cluster[:5] if len(cluster) > 5 else cluster
                fetched_images = await asyncio.gather(*(ibe.fetch(o.id, band=o.band_index) for o in bands_to_fetch))
                epoch_img = await processor.coadd_detector_array(list(fetched_images))
            else:
                target_obs = cluster[0]
                b = band if band is not None else target_obs.band_index
                epoch_img = await ibe.fetch(target_obs.id, band=b)

            epoch_images.append(epoch_img)

            # Render PNG tile with selected stretch (default Asinh WiseView mode)
            img_b64 = await processor.render_tile(epoch_img, stretch=stretch)

            # Extract WCS Header
            wcs_dict = processor.extract_wcs_header(epoch_img.wcs)
            wcs_header = WCSHeader(**wcs_dict)

            # Flag summary
            bad_px = int((epoch_img.flags != 0).sum())
            cosmic_rays = int((epoch_img.flags == 1).sum())
            saturated = int((epoch_img.flags == 2).sum())

            flags_summary = FlagSummary(
                clean_pct=float(epoch_img.quality_pct),
                cosmic_ray_px=cosmic_rays,
                saturated_px=saturated,
                bad_px=bad_px,
            )

            dt_str = "2025-05-15"
            try:
                from datetime import timedelta
                dt_str = (date(2025, 5, 1) + timedelta(days=int(epoch_img.epoch_mjd - 60400))).isoformat()
            except Exception:
                pass

            epoch_frames.append(
                EpochFrame(
                    epoch_index=ep_idx + 1,
                    epoch_mjd=round(epoch_img.epoch_mjd, 1),
                    obs_date=str(dt_str),
                    image_b64=img_b64,
                    wcs=wcs_header,
                    flags=flags_summary,
                    band_index=epoch_img.band_index,
                    detector_array=array,
                    wavelength_um=round(epoch_img.wavelength_um, 3),
                    is_simulated=bool(epoch_img.is_simulated),
                )
            )

        # Provenance: tell the client whether any frame is simulated demo data.
        n_sim = sum(1 for img in epoch_images if img.is_simulated)
        any_sim = n_sim > 0
        if n_sim == 0:
            data_source = "live"
        elif n_sim == len(epoch_images):
            data_source = "simulated"
        else:
            data_source = "mixed"

        # 4. Difference image (Epoch N - Epoch 1) and candidate detection
        difference_b64 = None
        falsecolor_b64 = None
        candidates_responses: list[CandidateResponse] = []

        if len(epoch_images) >= 2:
            first_ep = epoch_images[0]
            last_ep = epoch_images[-1]
            aligned_first, aligned_last = await processor.align(first_ep, last_ep)
            diff_arr, snr_map = await processor.subtract(aligned_first, aligned_last)
            difference_b64 = await processor.render_diff_tile(snr_map, colormap="diverging")

            try:
                falsecolor_b64 = await processor.render_false_color(aligned_last, aligned_first, aligned_first)
            except Exception:
                pass

            try:
                detected_candidates = await processor.detect_sources(snr_map, wcs=first_ep.wcs)
                comparison_id = f"{'sim_' if any_sim else ''}epoch_{ra:.4f}_{dec:.4f}_{fov:.4f}"
                for cand in detected_candidates:
                    await candidate_repo.save(cand, comparison_id)
                candidates_responses = [CandidateResponse(**cand.__dict__) for cand in detected_candidates]
            except Exception:
                pass

        resp_obj = EpochsResponse(
            ra=ra,
            dec=dec,
            fov=fov,
            detector_array=array,
            band_index=band,
            stretch=stretch,
            epochs=epoch_frames,
            difference_b64=difference_b64,
            falsecolor_b64=falsecolor_b64,
            candidates=candidates_responses,
            data_source=data_source,
            is_simulated=any_sim,
        )
        # Cache live results for a day, but only briefly cache simulated ones so
        # real data replaces them as soon as the archive is reachable again.
        await cache.set(cache_key, resp_obj.model_dump(), ttl=300 if any_sim else 86400)
        return resp_obj

    except HTTPException:
        raise
    except (NoDataError, IRSAError) as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
