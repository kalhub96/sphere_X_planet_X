"""Add and subtract epochs the user picks."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query

from ..epoch_loader import ARCHIVE_ERRORS, load_epoch_image, parse_epoch_list
from ..schemas import CombineResponse
from src.domain.services.epoch_clustering import cluster_epochs
from src.infrastructure.adapters.irsa_ibe_adapter import IRSAIBEAdapter
from src.infrastructure.adapters.irsa_sia_adapter import DETECTOR_ARRAY_BANDS, IRSASIAAdapter
from src.infrastructure.adapters.numpy_processor import NumpyImageProcessor
from src.infrastructure.adapters.redis_cache import RedisCache
from src.infrastructure.api.dependencies import (
    get_cache,
    get_ibe_adapter,
    get_processor,
    get_sia_adapter,
)

router = APIRouter(prefix="/api/v1/epochs", tags=["epochs"])


def _label(plus: list[int], minus: list[int], kind: str) -> str:
    plus_text = "+".join(f"E{n}" for n in plus)
    if kind == "stack":
        return f"Stack of {plus_text}" if len(plus) > 1 else f"Epoch {plus[0]}"
    minus_text = "+".join(f"E{n}" for n in minus)
    return f"({plus_text}) − ({minus_text})"


@router.get("/combine", response_model=CombineResponse)
async def combine_epochs(
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    fov: float = Query(0.08, ge=0.01, le=1.0),
    plus: str = Query(..., description='Epoch numbers to add, e.g. "1,2"'),
    minus: str | None = Query(None, description='Epoch numbers to subtract, e.g. "3"'),
    array: str | None = Query(None, description="Detector array D1-D6"),
    band: int | None = Query(None, ge=0, le=101),
    simulate: bool = Query(False, description="Demo mode (simulated sky)"),
    sia: IRSASIAAdapter = Depends(get_sia_adapter),
    ibe: IRSAIBEAdapter = Depends(get_ibe_adapter),
    processor: NumpyImageProcessor = Depends(get_processor),
    cache: RedisCache = Depends(get_cache),
):
    if array is not None and array not in DETECTOR_ARRAY_BANDS:
        raise HTTPException(status_code=400, detail="array must be one of D1, D2, D3, D4, D5, D6")
    try:
        plus_list = parse_epoch_list(plus)
        minus_list = parse_epoch_list(minus)
    except ValueError:
        raise HTTPException(status_code=400, detail="plus/minus must be comma-separated epoch numbers like 1,2")
    if not plus_list:
        raise HTTPException(status_code=400, detail="Choose at least one epoch to add.")
    if set(plus_list) & set(minus_list):
        raise HTTPException(status_code=400, detail="An epoch cannot be both added and subtracted.")

    mode = "sim" if simulate else "live"
    cache_key = (
        f"epochs_combine:{mode}:{ra:.4f}:{dec:.4f}:{fov:.4f}:{array}:{band}:"
        f"{','.join(map(str, plus_list))}:{','.join(map(str, minus_list))}"
    )
    cached = await cache.get(cache_key)
    if cached:
        return CombineResponse(**cached)

    try:
        observations = await sia.search(
            ra=ra, dec=dec, radius_deg=fov / 2.0, band=band, array=array, simulate=simulate
        )
        clusters = cluster_epochs(observations)
        wanted = sorted(set(plus_list) | set(minus_list))
        missing = [n for n in wanted if n > len(clusters)]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Epoch {missing[0]} does not exist here; this field has {len(clusters)} epoch(s).",
            )

        # Only the epochs the user picked are downloaded.
        loaded = await asyncio.gather(
            *(
                load_epoch_image(ibe, processor, clusters[n - 1], array=array, band=band)
                for n in wanted
            )
        )
        by_epoch = dict(zip(wanted, loaded))
        image_b64, kind = await processor.combine_epochs(
            [by_epoch[n] for n in plus_list], [by_epoch[n] for n in minus_list]
        )
        any_sim = any(img.is_simulated for img in loaded)
        response = CombineResponse(
            ra=ra,
            dec=dec,
            fov=fov,
            plus=plus_list,
            minus=minus_list,
            kind=kind,
            label=_label(plus_list, minus_list, kind),
            image_b64=image_b64,
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
