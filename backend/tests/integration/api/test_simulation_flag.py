"""Real data by default; a scripted demo sky only when the user asks for it.

The archive network boundary is replaced: the SIA adapter's HTTP call is forced
to fail and the cutout adapter never touches the network.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from src.domain.entities.observation import is_simulated_obs_id
from src.domain.exceptions import IRSAError, NoDataError
from src.infrastructure.adapters.irsa_ibe_adapter import IRSAIBEAdapter
from src.infrastructure.adapters.irsa_sia_adapter import IRSASIAAdapter
from src.infrastructure.api.dependencies import get_ibe_adapter, get_sia_adapter
from tests.integration.api.test_api import FixtureArchive, FixtureImageSource

RA, DEC = 133.7951, -7.2451


class OfflineIBE(IRSAIBEAdapter):
    """Cutout adapter with no known download URL (so nothing hits the network)."""

    async def _fits_url_for(self, obs_id: str) -> str:
        return obs_id


class UnreachableIBE(IRSAIBEAdapter):
    """Cutout adapter whose download URL points at a closed port."""

    async def _fits_url_for(self, obs_id: str) -> str:
        return "http://127.0.0.1:9/cutout.fits"


class FlakyImageSource(FixtureImageSource):
    """Epoch 2 (fixture-1) cannot be downloaded; the others can."""

    async def fetch(self, obs_id: str, band: int, **kwargs):
        if obs_id.endswith("-1"):
            raise IRSAError("IRSA timed out for fixture-1")
        return await super().fetch(obs_id, band, **kwargs)


def _sia(tmp_path) -> IRSASIAAdapter:
    adapter = IRSASIAAdapter(database_url=f"sqlite+aiosqlite:///{tmp_path}/sia.db")

    async def unreachable(*args, **kwargs):
        raise IRSAError("archive unreachable (test)")

    adapter._fetch_collection = unreachable  # type: ignore[method-assign]
    return adapter


def _ibe(tmp_path) -> OfflineIBE:
    return OfflineIBE(database_url=f"sqlite+aiosqlite:///{tmp_path}/ibe.db")


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_obs_id_helper_separates_demo_ids_from_archive_ids() -> None:
    assert is_simulated_obs_id("spherex_dr1_133.7951_-7.2451_pass1_b85")
    assert not is_simulated_obs_id("2025W19_1B_0231_3")


# ---- adapters -------------------------------------------------------------


@pytest.mark.asyncio
async def test_archive_outage_is_an_error_not_fake_data(tmp_path) -> None:
    with pytest.raises(IRSAError):
        await _sia(tmp_path).search(RA, DEC, 0.04, array="D6")


@pytest.mark.asyncio
async def test_demo_mode_needs_no_archive_and_flags_everything(tmp_path) -> None:
    observations = await _sia(tmp_path).search(RA, DEC, 0.04, array="D6", simulate=True)
    assert observations
    assert all(o.is_simulated and is_simulated_obs_id(o.id) for o in observations)


@pytest.mark.asyncio
async def test_demo_observations_are_never_persisted(tmp_path) -> None:
    observations = await _sia(tmp_path).search(RA, DEC, 0.04, array="D6", simulate=True)
    second = IRSASIAAdapter(database_url=f"sqlite+aiosqlite:///{tmp_path}/sia.db")
    assert await second.get_by_id(observations[0].id) is None


@pytest.mark.asyncio
async def test_real_observation_with_no_url_raises_instead_of_inventing_pixels(tmp_path) -> None:
    with pytest.raises(NoDataError):
        await _ibe(tmp_path).fetch("2025W19_1B_0231_3", band=85)


@pytest.mark.asyncio
async def test_failed_download_raises_instead_of_inventing_pixels(tmp_path) -> None:
    adapter = UnreachableIBE(database_url=f"sqlite+aiosqlite:///{tmp_path}/ibe2.db", timeout=1.0)
    with pytest.raises(IRSAError):
        await adapter.fetch("2025W19_1B_0231_3", band=85)


@pytest.mark.asyncio
async def test_demo_id_gives_a_flagged_frame(tmp_path) -> None:
    image = await _ibe(tmp_path).fetch("spherex_dr1_133.7951_-7.2451_pass1_b85", band=85)
    assert image.is_simulated is True


# ---- epochs endpoint ------------------------------------------------------


@pytest.mark.asyncio
async def test_epochs_default_is_real_only_and_reports_outage_honestly(tmp_path) -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: _sia(tmp_path)
    app.dependency_overrides[get_ibe_adapter] = lambda: _ibe(tmp_path)
    async with _client() as client:
        response = await client.get(f"/api/v1/epochs?ra={RA}&dec={DEC}&fov=0.0811&array=D6")
    assert response.status_code == 503
    assert "IRSA" in response.json()["detail"]


@pytest.mark.asyncio
async def test_epochs_demo_mode_labels_every_frame(tmp_path) -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: _sia(tmp_path)
    app.dependency_overrides[get_ibe_adapter] = lambda: _ibe(tmp_path)
    async with _client() as client:
        response = await client.get(
            f"/api/v1/epochs?ra={RA}&dec={DEC}&fov=0.0822&array=D6&simulate=true"
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_simulated"] is True
    assert payload["data_source"] == "simulated"
    assert len(payload["epochs"]) == 3
    assert all(frame["is_simulated"] for frame in payload["epochs"])
    # Demo dates are real calendar dates derived from the MJD.
    assert payload["epochs"][0]["obs_date"] == "2025-05-15"


@pytest.mark.asyncio
async def test_epochs_real_frames_are_reported_live() -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: FixtureArchive()
    app.dependency_overrides[get_ibe_adapter] = lambda: FixtureImageSource()
    async with _client() as client:
        response = await client.get(f"/api/v1/epochs?ra={RA}&dec={DEC}&fov=0.0833&array=D6")
    payload = response.json()
    assert response.status_code == 200
    assert payload["is_simulated"] is False and payload["data_source"] == "live"
    assert payload["warnings"] == []


@pytest.mark.asyncio
async def test_epochs_missing_epoch_is_reported_and_never_filled_in() -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: FixtureArchive()
    app.dependency_overrides[get_ibe_adapter] = lambda: FlakyImageSource()
    async with _client() as client:
        response = await client.get(f"/api/v1/epochs?ra={RA}&dec={DEC}&fov=0.0844&array=D6")
    payload = response.json()
    assert response.status_code == 200
    assert [f["epoch_index"] for f in payload["epochs"]] == [1, 3]
    assert len(payload["warnings"]) == 1 and "Epoch 2" in payload["warnings"][0]
    assert payload["is_simulated"] is False


# ---- combine endpoint (add / subtract epochs) ------------------------------


@pytest.mark.asyncio
async def test_combine_adds_epochs_into_a_stack() -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: FixtureArchive()
    app.dependency_overrides[get_ibe_adapter] = lambda: FixtureImageSource()
    async with _client() as client:
        response = await client.get(
            f"/api/v1/epochs/combine?ra={RA}&dec={DEC}&fov=0.0855&array=D6&plus=1,2"
        )
    payload = response.json()
    assert response.status_code == 200
    assert payload["kind"] == "stack" and payload["plus"] == [1, 2] and payload["minus"] == []
    assert payload["image_b64"] and payload["is_simulated"] is False


@pytest.mark.asyncio
async def test_combine_subtracts_epochs_into_a_difference() -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: FixtureArchive()
    app.dependency_overrides[get_ibe_adapter] = lambda: FixtureImageSource()
    async with _client() as client:
        response = await client.get(
            f"/api/v1/epochs/combine?ra={RA}&dec={DEC}&fov=0.0866&array=D6&plus=3&minus=1"
        )
    payload = response.json()
    assert response.status_code == 200
    assert payload["kind"] == "difference"
    assert payload["label"] == "(E3) − (E1)"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "query",
    ["plus=9", "plus=1&minus=1", "plus=abc", "plus=0"],
)
async def test_combine_rejects_bad_epoch_selections(query: str) -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: FixtureArchive()
    app.dependency_overrides[get_ibe_adapter] = lambda: FixtureImageSource()
    async with _client() as client:
        response = await client.get(
            f"/api/v1/epochs/combine?ra={RA}&dec={DEC}&fov=0.0877&array=D6&{query}"
        )
    assert response.status_code == 400


# ---- false-colour endpoint --------------------------------------------------


@pytest.mark.asyncio
async def test_false_colour_builds_three_real_channels_in_demo_mode(tmp_path) -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: _sia(tmp_path)
    app.dependency_overrides[get_ibe_adapter] = lambda: _ibe(tmp_path)
    # Demo sky only covers whatever bands we ask for; false colour asks for all arrays.
    async with _client() as client:
        response = await client.get(
            f"/api/v1/falsecolor?ra={RA}&dec={DEC}&fov=0.0888&red=D6&green=D3&blue=D1&simulate=true"
        )
    payload = response.json()
    assert response.status_code == 200, payload
    assert payload["is_simulated"] is True
    assert [c["array"] for c in payload["channels"]] == ["D6", "D3", "D1"]
    assert payload["channels"][0]["wavelength_min_um"] > payload["channels"][2]["wavelength_max_um"]
    assert payload["image_b64"]


@pytest.mark.asyncio
async def test_false_colour_says_which_array_is_missing() -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: FixtureArchive()  # only D3 exposures
    app.dependency_overrides[get_ibe_adapter] = lambda: FixtureImageSource()
    async with _client() as client:
        response = await client.get(f"/api/v1/falsecolor?ra={RA}&dec={DEC}&fov=0.0899")
    assert response.status_code == 404
    assert "D6" in response.json()["detail"]  # the red channel has no exposures


@pytest.mark.asyncio
async def test_false_colour_needs_three_different_arrays() -> None:
    app.dependency_overrides[get_sia_adapter] = lambda: FixtureArchive()
    app.dependency_overrides[get_ibe_adapter] = lambda: FixtureImageSource()
    async with _client() as client:
        response = await client.get(
            f"/api/v1/falsecolor?ra={RA}&dec={DEC}&red=D6&green=D6&blue=D1"
        )
    assert response.status_code == 400
