"""Real three-band false-colour composite.

Each colour channel is a stack of SPHEREx exposures from one detector array
(one wavelength range) of the same survey epoch, so colour means wavelength:
red = longest wavelengths chosen, blue = shortest.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from ..epoch_loader import ARCHIVE_ERRORS, fetch_stack, mjd_to_iso
from ..schemas import FalseColorChannel, FalseColorResponse
from src.domain.services.epoch_clustering import cluster_epochs
from src.infrastructure.adapters.irsa_ibe_adapter import IRSAIBEAdapter
from src.infrastructure.adapters.irsa_sia_adapter import (
    DETECTOR_ARRAY_BANDS,
    SPHEREX_WAVELENGTHS,
    IRSASIAAdapter,
)
from src.infrastructure.adapters.numpy_processor import NumpyImageProcessor
from src.infrastructure.adapters.redis_cache import RedisCache
from src.infrastructure.api.dependencies import (
    get_cache,
    get_ibe_adapter,
    get_processor,
    get_sia_adapter,
)

router = APIRouter(prefix="/api/v1/falsecolor", tags=["falsecolor"])


@router.get("", response_model=FalseColorResponse)
async def false_color(
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    fov: float = Query(0.08, ge=0.01, le=1.0),
    red: str = Query("D6", description="Detector array for the red channel (D1-D6)"),
    green: str = Query("D3", description="Detector array for the green channel"),
    blue: str = Query("D1", description="Detector array for the blue channel"),
    epoch: int | None = Query(None, ge=1, description="Survey epoch number (default: latest)"),
    simulate: bool = Query(False, description="Demo mode (simulated sky)"),
    sia: IRSASIAAdapter = Depends(get_sia_adapter),
    ibe: IRSAIBEAdapter = Depends(get_ibe_adapter),
    processor: NumpyImageProcessor = Depends(get_processor),
    cache: RedisCache = Depends(get_cache),
):
    chosen = {"red": red, "green": green, "blue": blue}
    for colour, array in chosen.items():
        if array not in DETECTOR_ARRAY_BANDS:
            raise HTTPException(status_code=400, detail=f"{colour} must be one of D1, D2, D3, D4, D5, D6")
    if len(set(chosen.values())) < 3:
        raise HTTPException(status_code=400, detail="Choose three different detector arrays for the three colours.")

    mode = "sim" if simulate else "live"
    cache_key = f"falsecolor:{mode}:{ra:.4f}:{dec:.4f}:{fov:.4f}:{red}:{green}:{blue}:{epoch}"
    cached = await cache.get(cache_key)
    if cached:
        return FalseColorResponse(**cached)

    try:
        observations = await sia.search(ra=ra, dec=dec, radius_deg=fov / 2.0, simulate=simulate)
        clusters = cluster_epochs(observations)
        if not clusters:
            raise HTTPException(
                status_code=404,
                detail="The SPHEREx archive has no observations covering these coordinates yet.",
            )
        epoch_number = epoch if epoch is not None else len(clusters)
        if epoch_number > len(clusters):
            raise HTTPException(
                status_code=400,
                detail=f"Epoch {epoch_number} does not exist here; this field has {len(clusters)} epoch(s).",
            )
        cluster = clusters[epoch_number - 1]

        images = {}
        channels: list[FalseColorChannel] = []
        for colour, array in chosen.items():
            bands = set(DETECTOR_ARRAY_BANDS[array])
            exposures = [o for o in cluster if o.band_index in bands]
            if not exposures:
                raise HTTPException(
                    status_code=404,
                    detail=f"Epoch {epoch_number} has no {array} exposures for this field, so the {colour} channel cannot be built.",
                )
            images[colour] = await fetch_stack(ibe, processor, exposures)
            wavelengths = [SPHEREX_WAVELENGTHS[b] for b in DETECTOR_ARRAY_BANDS[array]]
            channels.append(
                FalseColorChannel(
                    channel=colour,
                    array=array,
                    wavelength_min_um=round(min(wavelengths), 3),
                    wavelength_max_um=round(max(wavelengths), 3),
                    n_exposures=min(len(exposures), 5),
                )
            )

        # Put green and blue on the red image's pixel grid before combining.
        _, green_aligned = await processor.align(images["red"], images["green"])
        _, blue_aligned = await processor.align(images["red"], images["blue"])
        image_b64 = await processor.render_rgb(images["red"], green_aligned, blue_aligned)

        any_sim = any(img.is_simulated for img in images.values())
        response = FalseColorResponse(
            ra=ra,
            dec=dec,
            fov=fov,
            epoch_index=epoch_number,
            obs_date=mjd_to_iso(cluster[0].epoch_mjd),
            image_b64=image_b64,
            channels=channels,
            data_source="simulated" if any_sim else "live",
            is_simulated=any_sim,
        )
        await cache.set(cache_key, response.model_dump(), ttl=3600 if any_sim else 86400)
        return response
    except HTTPException:
        raise
    except ARCHIVE_ERRORS as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
