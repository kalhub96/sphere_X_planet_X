"""Simulated (offline demo) data must always be labelled, never passed off as real.

The archive network boundary is replaced: the SIA adapter's HTTP call is forced
to fail, and the cutout adapter never touches the network.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from src.domain.entities.observation import is_simulated_obs_id
from src.domain.exceptions import IRSAError, NoDataError
from src.infrastructure.adapters.irsa_ibe_adapter import IRSAIBEAdapter
from src.infrastructure.adapters.irsa_sia_adapter import IRSASIAAdapter
from src.infrastructure.api.dependencies import get_ibe_adapter, get_sia_adapter

RA, DEC = 133.7951, -7.2451


class OfflineIBE(IRSAIBEAdapter):
    """Cutout adapter that never goes to the network: every fetch is a fallback."""

    async def _fits_url_for(self, obs_id: str) -> str:
        return obs_id


def _sia(tmp_path, *, allow_simulation: bool) -> IRSASIAAdapter:
    adapter = IRSASIAAdapter(
        database_url=f"sqlite+aiosqlite:///{tmp_path}/sia.db",
        allow_simulation=allow_simulation,
    )

    async def unreachable(*args, **kwargs):
        raise IRSAError("archive unreachable (test)")

    adapter._fetch_collection = unreachable  # type: ignore[method-assign]
    return adapter


def _ibe(tmp_path, *, allow_simulation: bool) -> OfflineIBE:
    return OfflineIBE(
        database_url=f"sqlite+aiosqlite:///{tmp_path}/ibe.db",
        allow_simulation=allow_simulation,
    )


def test_obs_id_helper_separates_simulated_from_archive_ids() -> None:
    assert is_simulated_obs_id("spherex_dr1_133.7951_-7.2451_pass1_b85")
    assert not is_simulated_obs_id("2025W19_1B_0231_3")
    assert not is_simulated_obs_id("fixture-1")


@pytest.mark.asyncio
async def test_sia_fallback_flags_every_observation_when_archive_is_down(tmp_path) -> None:
    observations = await _sia(tmp_path, allow_simulation=True).search(RA, DEC, 0.04, array="D6")
    assert observations
    assert all(o.is_simulated for o in observations)
    assert all(is_simulated_obs_id(o.id) for o in observations)


@pytest.mark.asyncio
async def test_sia_refuses_to_simulate_when_disabled(tmp_path) -> None:
    with pytest.raises(IRSAError):
        await _sia(tmp_path, allow_simulation=False).search(RA, DEC, 0.04, array="D6")


@pytest.mark.asyncio
async def test_simulated_observations_are_never_persisted(tmp_path) -> None:
    first = _sia(tmp_path, allow_simulation=True)
    observations = await first.search(RA, DEC, 0.04, array="D6")
    # A fresh adapter has no in-memory state: only the database could return it.
    second = IRSASIAAdapter(database_url=f"sqlite+aiosqlite:///{tmp_path}/sia.db")
    assert await second.get_by_id(observations[0].id) is None


@pytest.mark.asyncio
async def test_fallback_image_is_flagged_and_disabled_mode_raises(tmp_path) -> None:
    image = await _ibe(tmp_path, allow_simulation=True).fetch(
        "spherex_dr1_133.7951_-7.2451_pass1_b85", band=85
    )
    assert image.is_simulated is True
    with pytest.raises(NoDataError):
        await _ibe(tmp_path, allow_simulation=False).fetch(
            "spherex_dr1_133.7951_-7.2451_pass1_b85", band=85
        )


@pytest.mark.asyncio
async def test_epochs_endpoint_labels_simulated_frames(tmp_path) -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: _sia(tmp_path, allow_simulation=True)
    app.dependency_overrides[get_ibe_adapter] = lambda: _ibe(tmp_path, allow_simulation=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/epochs?ra={RA}&dec={DEC}&fov=0.0811&array=D6"
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_simulated"] is True
    assert payload["data_source"] == "simulated"
    assert len(payload["epochs"]) >= 2
    assert all(frame["is_simulated"] for frame in payload["epochs"])


@pytest.mark.asyncio
async def test_epochs_endpoint_returns_503_when_simulation_disabled(tmp_path) -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: _sia(tmp_path, allow_simulation=False)
    app.dependency_overrides[get_ibe_adapter] = lambda: _ibe(tmp_path, allow_simulation=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/epochs?ra={RA}&dec={DEC}&fov=0.0822&array=D6"
        )
    assert response.status_code == 503
    assert "ALLOW_SIMULATED_DATA" in response.json()["detail"]


@pytest.mark.asyncio
async def test_epochs_endpoint_reports_live_for_archive_frames() -> None:
    # Uses the archive fixtures installed by test_api.py's autouse fixture when
    # run together; here we install equivalent live fixtures explicitly.
    from tests.integration.api.test_api import FixtureArchive, FixtureImageSource

    app.dependency_overrides[get_sia_adapter] = lambda: FixtureArchive()
    app.dependency_overrides[get_ibe_adapter] = lambda: FixtureImageSource()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/epochs?ra={RA}&dec={DEC}&fov=0.0833&array=D6"
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_simulated"] is False
    assert payload["data_source"] == "live"
    assert not any(frame["is_simulated"] for frame in payload["epochs"])


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()
