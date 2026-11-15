from dataclasses import asdict

from fastapi import APIRouter, Query

from src.infrastructure.adapters.timelapse_service import build_timelapse
from src.infrastructure.config import settings

router = APIRouter(prefix="/api/v1/timelapse", tags=["timelapse"])


@router.get("")
async def timelapse(
    ra: float = Query(..., ge=0.0, le=360.0, description="Right Ascension, ICRS degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="Declination, ICRS degrees"),
    fov: float = Query(5.0, ge=1.0, le=30.0, description="Field of view in arcminutes"),
    detector: int | None = Query(None, ge=1, le=6, description="Restrict to one of the 6 detector arrays"),
    max_frames: int = Query(24, ge=2, le=60),
):
    tl = await build_timelapse(
        getattr(settings, "irsa_tap_url", "https://irsa.ipac.caltech.edu/TAP"),
        ra, dec, fov, detector, max_frames,
        allow_synthetic=settings.allow_synthetic_fallback,
    )
    return {
        "source": tl.source,
        "ra": tl.ra,
        "dec": tl.dec,
        "fov_arcmin": tl.fov_arcmin,
        "size_px": tl.size_px,
        "pixel_scale_arcsec": 6.2,
        "collection": "SPHEREx (IRSA TAP)",
        "notes": tl.notes,
        "frames": [asdict(f) for f in tl.frames],
    }
