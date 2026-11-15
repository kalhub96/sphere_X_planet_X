import time
from fastapi import APIRouter, Depends, HTTPException, Query
from ..schemas import CompareResponse, CandidateResponse, WCSHeader
from src.infrastructure.api.dependencies import get_compare_uc, get_candidate_repo, get_processor
from src.infrastructure.adapters.sqlite_candidate_repo import SQLiteCandidateRepository
from src.infrastructure.adapters.numpy_processor import NumpyImageProcessor

router = APIRouter(prefix="/api/v1/compare", tags=["compare"])

@router.get("", response_model=CompareResponse)
async def compare_observations(
    obs_a: str = Query(..., description="Observation A ID"),
    obs_b: str = Query(..., description="Observation B ID"),
    band: int = Query(50, ge=0, le=101, description="SPHEREx band index (0-101)"),
    use_case=Depends(get_compare_uc),
    candidate_repo: SQLiteCandidateRepository = Depends(get_candidate_repo),
    processor: NumpyImageProcessor = Depends(get_processor),
):
    t0 = time.perf_counter()
    try:
        result = await use_case.execute(obs_a_id=obs_a, obs_b_id=obs_b, band=band)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    comparison_id = f"{obs_a}_{obs_b}_{band}"

    # Save candidates to candidate repository
    for c in result.candidates:
        await candidate_repo.save(c, comparison_id)

    # Cached comparisons retain the WCS in metadata. Never replace an
    # archive-derived WCS with a nominal pointing.
    if result.image_a and hasattr(result.image_a, "wcs"):
        wcs_dict = processor.extract_wcs_header(result.image_a.wcs)
    else:
        wcs_dict = result.metadata.get("wcs")
    if not isinstance(wcs_dict, dict):
        raise HTTPException(status_code=500, detail="Comparison cache is missing its FITS WCS header")

    return CompareResponse(
        comparison_id=comparison_id,
        image_a_b64=result.tile_a_b64,
        image_b_b64=result.tile_b_b64,
        difference_b64=result.tile_diff_b64,
        falsecolor_b64=None,
        wcs=WCSHeader(**wcs_dict),
        candidates=[CandidateResponse(**c.__dict__) for c in result.candidates],
        metadata={**result.metadata, "processing_ms": elapsed_ms},
    )
