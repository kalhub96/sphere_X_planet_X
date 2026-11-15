from fastapi import APIRouter, Depends, Query, HTTPException
from ..schemas import EpochsResponse, EpochFrame, WCSHeader, FlagSummary, CandidateResponse
from ..epoch_loader import ARCHIVE_ERRORS, load_epoch_image, mjd_to_iso
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
from src.domain.services.epoch_clustering import cluster_epochs

router = APIRouter(prefix="/api/v1/epochs", tags=["epochs"])


@router.get("", response_model=EpochsResponse)
async def get_multi_epoch_flipbook(
    ra: float = Query(..., ge=0.0, le=360.0, description="Right Ascension in degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="Declination in degrees"),
    fov: float = Query(0.08, ge=0.01, le=1.0, description="Field of View in degrees"),
    array: str | None = Query(None, description="SPHEREx Detector Array (D1, D2, D3, D4, D5, D6)"),
    band: int | None = Query(None, ge=0, le=101, description="Single SPHEREx band index (0-101)"),
    stretch: str = Query("asinh", description="Image stretch: asinh, zscale, log, linear"),
    simulate: bool = Query(
        False,
        description="Demo mode: use a scripted, clearly labelled simulated sky instead of real SPHEREx data",
    ),
    sia: IRSASIAAdapter = Depends(get_sia_adapter),
    ibe: IRSAIBEAdapter = Depends(get_ibe_adapter),
    processor: NumpyImageProcessor = Depends(get_processor),
    candidate_repo: SQLiteCandidateRepository = Depends(get_candidate_repo),
    cache: RedisCache = Depends(get_cache),
):
    if array is not None and array not in DETECTOR_ARRAY_BANDS:
        raise HTTPException(status_code=400, detail="array must be one of D1, D2, D3, D4, D5, D6")

    mode = "sim" if simulate else "live"
    cache_key = f"epochs_flipbook:{mode}:{ra:.4f}:{dec:.4f}:{fov:.4f}:{array}:{band}:{stretch}"
    cached = await cache.get(cache_key)
    if cached:
        return EpochsResponse(**cached)

    try:
        # 1. Find the SPHEREx observations covering this patch of sky.
        observations = await sia.search(
            ra=ra, dec=dec, radius_deg=fov / 2.0, band=band, array=array, simulate=simulate
        )
        if not observations:
            raise HTTPException(
                status_code=404,
                detail="The SPHEREx archive has no observations covering these coordinates yet.",
            )

        # 2. Group them into survey epochs (one full-sky pass is about six months).
        epoch_clusters = cluster_epochs(observations)

        # 3. Build one image per epoch. An epoch that cannot be downloaded is
        #    reported in `warnings` and left out; nothing is made up to fill it.
        epoch_frames: list[EpochFrame] = []
        epoch_images: list[FITSImage] = []
        warnings: list[str] = []
        first_error: Exception | None = None

        for ep_idx, cluster in enumerate(epoch_clusters):
            try:
                epoch_img = await load_epoch_image(ibe, processor, cluster, array=array, band=band)
            except ARCHIVE_ERRORS as error:
                first_error = first_error or error
                warnings.append(f"Epoch {ep_idx + 1} ({mjd_to_iso(cluster[0].epoch_mjd)}) is missing: {error}")
                continue

            epoch_images.append(epoch_img)
            img_b64 = await processor.render_tile(epoch_img, stretch=stretch)
            wcs_header = WCSHeader(**processor.extract_wcs_header(epoch_img.wcs))

            flags_summary = FlagSummary(
                clean_pct=float(epoch_img.quality_pct),
                cosmic_ray_px=int((epoch_img.flags == 1).sum()),
                saturated_px=int((epoch_img.flags == 2).sum()),
                bad_px=int((epoch_img.flags != 0).sum()),
            )

            epoch_frames.append(
                EpochFrame(
                    epoch_index=ep_idx + 1,
                    epoch_mjd=round(epoch_img.epoch_mjd, 1),
                    obs_date=mjd_to_iso(epoch_img.epoch_mjd),
                    image_b64=img_b64,
                    wcs=wcs_header,
                    flags=flags_summary,
                    band_index=epoch_img.band_index,
                    detector_array=array,
                    wavelength_um=round(epoch_img.wavelength_um, 3),
                    is_simulated=bool(epoch_img.is_simulated),
                )
            )

        if not epoch_frames:
            raise first_error or HTTPException(status_code=503, detail="No epochs could be loaded.")

        # Provenance for the UI.
        n_sim = sum(1 for img in epoch_images if img.is_simulated)
        any_sim = n_sim > 0
        data_source = "live" if n_sim == 0 else ("simulated" if n_sim == len(epoch_images) else "mixed")

        # 4. Difference image (last epoch - first epoch) and candidate detection.
        difference_b64 = None
        candidates_responses: list[CandidateResponse] = []

        if len(epoch_images) >= 2:
            first_ep = epoch_images[0]
            last_ep = epoch_images[-1]
            aligned_first, aligned_last = await processor.align(first_ep, last_ep)
            _, snr_map = await processor.subtract(aligned_first, aligned_last)
            difference_b64 = await processor.render_diff_tile(snr_map, colormap="diverging")

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
            falsecolor_b64=None,
            candidates=candidates_responses,
            data_source=data_source,
            is_simulated=any_sim,
            warnings=warnings,
        )
        # Complete live results are cached for a day. Partial ones only briefly,
        # so a retry can pick up the epochs that failed.
        ttl = 300 if warnings else (3600 if any_sim else 86400)
        await cache.set(cache_key, resp_obj.model_dump(), ttl=ttl)
        return resp_obj

    except HTTPException:
        raise
    except ARCHIVE_ERRORS as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
