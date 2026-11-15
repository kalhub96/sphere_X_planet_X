from dataclasses import dataclass, field
from uuid import uuid4


class CandidateClassification:
    FAST_MOVING = "Fast-Moving Brown Dwarf / KBO"
    SLOW_MOVING = "Slow-Moving Outer Solar System Candidate"
    VARIABLE_STAR = "Infrared Variable Star"
    UNCLASSIFIED = "Unclassified"


@dataclass
class Candidate:
    ra: float
    dec: float
    pixel_x: float
    pixel_y: float
    snr_change: float = 0.0            # Signed SNR (positive = brightening)
    delta_flux: float = 0.0            # Flux change in data units
    delta_flux_sigma: float = 1.0      # Uncertainty on delta_flux
    motion_arcsec: float = 0.0         # Apparent motion (arcsec)
    artifact_probability: float = 0.0  # 0.0-1.0
    confidence_score: float = 0.0      # 0.0-1.0
    most_match: bool = False
    most_object_name: str | None = None
    most_object_type: str | None = None
    classification: str = CandidateClassification.UNCLASSIFIED
    id: str = field(default_factory=lambda: str(uuid4()))
    # API response compatibility fields (CandidateResponse)
    snr: float | None = None
    confidence: float | None = None
    motion_arcsec_yr: float | None = None
    position_angle_deg: float = 45.0
    is_known_solar_system: bool | None = None
    cross_matches: list = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.snr is None:
            self.snr = round(abs(float(self.snr_change)), 2)
        elif self.snr_change == 0.0:
            self.snr_change = float(self.snr)

        if self.confidence is None:
            self.confidence = round(float(self.confidence_score), 3)
        elif self.confidence_score == 0.0:
            self.confidence_score = float(self.confidence)

        if self.motion_arcsec_yr is None:
            self.motion_arcsec_yr = round(float(self.motion_arcsec), 2)
        elif self.motion_arcsec == 0.0:
            self.motion_arcsec = float(self.motion_arcsec_yr)

        if self.is_known_solar_system is None:
            self.is_known_solar_system = bool(self.most_match)
        elif not self.most_match and self.is_known_solar_system:
            self.most_match = True
