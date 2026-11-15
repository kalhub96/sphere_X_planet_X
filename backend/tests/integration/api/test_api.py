"""API integration tests with a deterministic archive boundary.

Production code queries real IRSA. These tests replace only that network
boundary with FITS fixtures, so unit tests are fast and never turn archive
outages into fake production observations.
"""

from datetime import date, timedelta

import numpy as np
import pytest
from astropy.wcs import WCS
from httpx import ASGITransport, AsyncClient

from main import app
from src.application.use_cases.compare_observations import CompareObservationsUC
from src.application.use_cases.generate_evidence import GenerateEvidenceUC
from src.application.use_cases.query_sky_region import QuerySkyRegionUC
from src.domain.entities.candidate import Candidate
from src.domain.entities.fits_image import FITSImage
from src.domain.entities.observation import Observation
from src.domain.services.confidence_scorer import ConfidenceScorer
from src.infrastructure.adapters.numpy_processor import NumpyImageProcessor
from src.infrastructure.adapters.redis_cache import RedisCache
from src.infrastructure.api.dependencies import (
    get_candidate_repo,
    get_compare_uc,
    get_evidence_uc,
    get_ibe_adapter,
    get_most_adapter,
    get_processor,
    get_query_sky_region_uc,
    get_sia_adapter,
)


class FixtureArchive:
    async def search(
        self,
        ra: float,
        dec: float,
        radius_deg: float,
        band: int | None = None,
        array: str | None = None,
        simulate: bool = False,
    ) -> list[Observation]:
        band_index = 85 if array == "D6" else (band if band is not None else 50)
        return [
            Observation(
                id=f"fixture-{epoch}",
                region_id="fixture",
                epoch_mjd=60430.0 + epoch * 183.0,
                band_index=band_index,
                wavelength_um=4.5 if band_index >= 85 else 2.3,
                fits_url=f"https://archive.example/fixture-{epoch}.fits",
                quality_pct=99.8,
                data_release="dr1" if epoch < 2 else "qr3",
                obs_date=date(2025, 5, 15) + timedelta(days=epoch * 183),
                ra=ra,
                dec=dec,
            )
            for epoch in range(3)
        ]


class FixtureImageSource:
    async def fetch(self, obs_id: str, band: int) -> FITSImage:
        epoch = int(obs_id.rsplit("-", maxsplit=1)[-1])
        wcs = WCS(naxis=2)
        wcs.wcs.crpix = [32.0, 32.0]
        wcs.wcs.crval = [133.7951, -7.2451]
        wcs.wcs.cdelt = [-6.2 / 3600, 6.2 / 3600]
        wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
        data = np.full((64, 64), 10.0, dtype=np.float32)
        data[32, 32] += 60.0 + epoch * 45.0
        return FITSImage(
            data=data,
            variance=np.ones((64, 64), dtype=np.float32),
            flags=np.zeros((64, 64), dtype=np.int16),
            wcs=wcs,
            epoch_mjd=60430.0 + epoch * 183.0,
            wavelength_um=4.5,
            band_index=band,
            obs_id=obs_id,
            quality_pct=100.0,
        )


class FixtureCandidateRepository:
    def __init__(self) -> None:
        self._items: dict[str, Candidate] = {}

    async def save(self, candidate: Candidate, comparison_id: str) -> None:
        self._items[candidate.id] = candidate

    async def get_by_id(self, candidate_id: str) -> Candidate | None:
        return self._items.get(candidate_id)

    async def get_by_comparison(self, comparison_id: str) -> list[Candidate]:
        return list(self._items.values())


class FixtureMost:
    async def check(self, ra: float, dec: float, epoch_mjd: float) -> dict[str, object]:
        return {"match": False, "object_name": None, "object_type": None}


@pytest.fixture(autouse=True)
def archive_boundary() -> None:
    cache = RedisCache("redis://unreachable.test:6379")
    archive = FixtureArchive()
    images = FixtureImageSource()
    processor = NumpyImageProcessor()
    candidates = FixtureCandidateRepository()
    most = FixtureMost()
    app.dependency_overrides = {
        get_sia_adapter: lambda: archive,
        get_ibe_adapter: lambda: images,
        get_processor: lambda: processor,
        get_candidate_repo: lambda: candidates,
        get_most_adapter: lambda: most,
        get_query_sky_region_uc: lambda: QuerySkyRegionUC(archive, cache),
        get_compare_uc: lambda: CompareObservationsUC(images, processor, cache),
        get_evidence_uc: lambda: GenerateEvidenceUC(candidates, most, ConfidenceScorer()),
    }
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_health_endpoint() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "skytrace-backend"}


@pytest.mark.asyncio
async def test_wavelengths_endpoint() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/wavelengths")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 102
    assert payload[0]["index"] == 0
    assert payload[0]["detector"] == "D1"
    assert payload[-1]["detector"] == "D6"


@pytest.mark.asyncio
async def test_observations_accepts_fov_and_preserves_archive_provenance() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/observations?ra=133.7951&dec=-7.2451&fov=0.08&array=D6")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 3
    assert payload[0]["fits_url"].startswith("https://archive.example/")
    assert {item["data_release"] for item in payload} == {"dr1", "qr3"}


@pytest.mark.asyncio
async def test_epochs_returns_chronological_frames_real_wcs_and_flags() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/epochs?ra=133.7951&dec=-7.2451&fov=0.08&array=D6")
    assert response.status_code == 200
    payload = response.json()
    assert [frame["epoch_index"] for frame in payload["epochs"]] == [1, 2, 3]
    assert all(len(frame["image_b64"]) > 500 for frame in payload["epochs"])
    assert payload["epochs"][0]["wcs"]["crval1"] == pytest.approx(133.7951)
    assert payload["epochs"][0]["flags"]["bad_px"] == 0


@pytest.mark.asyncio
async def test_compare_serializes_the_source_fits_wcs() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/compare?obs_a=fixture-0&obs_b=fixture-2&band=85")
    assert response.status_code == 200
    payload = response.json()
    assert payload["wcs"]["crpix1"] == 32.0
    assert payload["wcs"]["crval1"] == pytest.approx(133.7951)
    assert payload["wcs"]["cd1_1"] == pytest.approx(-6.2 / 3600)
    assert len(payload["difference_b64"]) > 500


@pytest.mark.asyncio
async def test_evidence_and_most_endpoints_are_wired_to_real_ports() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        evidence = await client.get("/api/v1/candidates/unknown/evidence")
        most = await client.get("/api/v1/most-check?ra=133.7951&dec=-7.2451")
    assert evidence.status_code == 200
    assert "narrative" in evidence.json()
    assert most.status_code == 200
    assert most.json()["match"] is False
