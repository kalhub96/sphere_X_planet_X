from pydantic import BaseModel, Field
from datetime import date

class WCSHeader(BaseModel):
    crpix1: float
    crpix2: float
    crval1: float
    crval2: float
    cd1_1: float
    cd1_2: float
    cd2_1: float
    cd2_2: float
    pixel_scale_arcsec: float

class FlagSummary(BaseModel):
    clean_pct: float
    cosmic_ray_px: int
    saturated_px: int
    bad_px: int

class ObservationResponse(BaseModel):
    id: str
    region_id: str
    epoch_mjd: float
    band_index: int
    wavelength_um: float
    fits_url: str
    quality_pct: float
    data_release: str
    obs_date: date
    ra: float
    dec: float
    # True when the record came from the offline demo fallback, not IRSA.
    is_simulated: bool = False

class CrossMatchResponse(BaseModel):
    catalog: str
    source_id: str
    angular_dist_arcsec: float
    proper_motion_mas_yr: float | None = None
    known_solar_system: bool = False

class CandidateResponse(BaseModel):
    id: str
    ra: float
    dec: float
    pixel_x: int
    pixel_y: int
    snr: float
    confidence: float
    classification: str
    motion_arcsec_yr: float
    position_angle_deg: float
    is_known_solar_system: bool
    cross_matches: list[CrossMatchResponse]

class CompareResponse(BaseModel):
    comparison_id: str
    image_a_b64: str
    image_b_b64: str
    difference_b64: str
    falsecolor_b64: str | None = None
    wcs: WCSHeader | dict
    candidates: list[CandidateResponse]
    metadata: dict

class EpochFrame(BaseModel):
    epoch_index: int
    epoch_mjd: float
    obs_date: str
    image_b64: str
    wcs: WCSHeader
    flags: FlagSummary
    band_index: int | None = None
    detector_array: str | None = None
    wavelength_um: float | None = None
    is_simulated: bool = False

class EpochsResponse(BaseModel):
    ra: float
    dec: float
    fov: float
    detector_array: str | None = None
    band_index: int | None = None
    stretch: str
    epochs: list[EpochFrame]
    difference_b64: str | None = None
    falsecolor_b64: str | None = None
    candidates: list[CandidateResponse] = Field(default_factory=list)
    # "live"      = every frame came from the SPHEREx archive
    # "mixed"     = some frames are real, some simulated
    # "simulated" = every frame is simulated demo data (NOT SPHEREx data)
    data_source: str = "live"
    is_simulated: bool = False
    # Epochs that could not be loaded (e.g. an archive download failed). The
    # frames that ARE shown are real; nothing is invented to fill the gap.
    warnings: list[str] = Field(default_factory=list)

class CombineResponse(BaseModel):
    ra: float
    dec: float
    fov: float
    plus: list[int]
    minus: list[int]
    kind: str                      # "stack" or "difference"
    label: str
    image_b64: str
    data_source: str = "live"
    is_simulated: bool = False

class FalseColorChannel(BaseModel):
    channel: str                   # "red" | "green" | "blue"
    array: str                     # "D1".."D6"
    wavelength_min_um: float
    wavelength_max_um: float
    n_exposures: int

class FalseColorResponse(BaseModel):
    ra: float
    dec: float
    fov: float
    epoch_index: int
    obs_date: str
    image_b64: str
    channels: list[FalseColorChannel]
    data_source: str = "live"
    is_simulated: bool = False

class EvidenceResponse(BaseModel):
    candidate_id: str
    narrative: str
    measurements: list[dict]
    caveats: list[str]
    irsa_links: list[dict]
    quality_flags: dict

class WavelengthBandResponse(BaseModel):
    index: int
    wavelength_um: float
    label: str
    detector: str
