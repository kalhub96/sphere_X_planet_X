from fastapi import APIRouter, Depends, HTTPException, Query
from src.domain.exceptions import IRSAError
from ..schemas import ObservationResponse
from src.infrastructure.api.dependencies import get_query_sky_region_uc

router = APIRouter(prefix="/api/v1/observations", tags=["observations"])

@router.get("", response_model=list[ObservationResponse])
async def list_observations(
    ra: float = Query(..., ge=0.0, le=360.0, description="Right Ascension in degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="Declination in degrees"),
    radius: float | None = Query(None, ge=0.01, le=5.0, description="Deprecated search radius in degrees"),
    fov: float | None = Query(None, ge=0.05, le=0.50, description="Full field of view in degrees"),
    band: int | None = Query(None, ge=0, le=101, description="SPHEREx band index"),
    array: str | None = Query(None, description="SPHEREx Detector Array (D1, D2, D3, D4, D5, D6)"),
    use_case=Depends(get_query_sky_region_uc),
):
    radius_deg = radius if radius is not None else (fov / 2.0 if fov is not None else 0.04)
    try:
        observations = await use_case.execute(
            ra=ra,
            dec=dec,
            radius_deg=radius_deg,
            band=band,
            array=array,
        )
    except IRSAError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return [ObservationResponse(**o.__dict__) for o in observations]
