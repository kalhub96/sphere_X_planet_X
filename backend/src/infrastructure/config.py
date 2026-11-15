import json
from typing import Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    redis_url: str = "redis://localhost:6379"
    database_url: str = "sqlite+aiosqlite:///./data/skytrace.db"
    # IRSA VO SIA2 official endpoint (supports both spherex_dr1 and spherex_qr3)
    irsa_sia2_url: str = "https://irsa.ipac.caltech.edu/SIA"
    irsa_ibe_url: str = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1"
    irsa_most_url: str = "https://irsa.ipac.caltech.edu/cgi-bin/MOST/nph-most"
    spherex_collections: list[str] = ["spherex_dr1", "spherex_qr3"]
    # Time-lapse endpoint: SIA service + SPHEREx collection (change the collection to pick up new data releases)
    irsa_timelapse_sia_url: str = "https://irsa.ipac.caltech.edu/SIA"
    irsa_spherex_collection: str = "spherex_qr3"
    allow_synthetic_fallback: bool = True
    log_level: str = "INFO"
    # When the IRSA archive is slow or unreachable, the backend can fall back to
    # a clearly labelled offline demo (simulated observations and images).
    # Set ALLOW_SIMULATED_DATA=false to disable it and return an honest error
    # instead; recommended for any scientific use.
    allow_simulated_data: bool = True
    allowed_origins: Union[list[str], str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    @field_validator("allowed_origins", mode="after")
    @classmethod
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(o).strip() for o in parsed if str(o).strip()]
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        if isinstance(v, list):
            return [str(origin).strip() for origin in v if str(origin).strip()]
        return v


settings = Settings()
