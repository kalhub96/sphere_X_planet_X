from fastapi import APIRouter
from ..schemas import WavelengthBandResponse

router = APIRouter(prefix="/api/v1/wavelengths", tags=["wavelengths"])

@router.get("", response_model=list[WavelengthBandResponse])
async def list_wavelengths():
    bands = []
    for i in range(102):
        w = 0.75 * ((5.0 / 0.75) ** (i / 101.0))
        # 6 HgCdTe detector array mapping (17 channels each)
        det_idx = min(i // 17 + 1, 6)
        detector = f"D{det_idx}"
        bands.append(WavelengthBandResponse(
            index=i,
            wavelength_um=round(w, 4),
            label=f"Band {i:02d} ({w:.2f} µm) [{detector}]",
            detector=detector,
        ))
    return bands
