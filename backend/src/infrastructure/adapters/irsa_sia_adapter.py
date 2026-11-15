"""IRSA VO SIA2 adapter querying both spherex_dr1 and spherex_qr3 collections."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from datetime import date, timedelta
from typing import Any, Final

import httpx
from sqlalchemy import select

from ...domain.entities.observation import Observation, is_simulated_obs_id
from ...domain.exceptions import IRSAError
from ..db.models import ObservationModel
from ..db.session import create_tables, get_session_factory

logger = logging.getLogger(__name__)

SPHEREX_WAVELENGTHS: Final[list[float]] = [
    round(0.75 * ((5.0 / 0.75) ** (i / 101.0)), 4) for i in range(102)
]

DETECTOR_ARRAY_BANDS: Final[dict[str, list[int]]] = {
    "D1": list(range(0, 17)),
    "D2": list(range(17, 34)),
    "D3": list(range(34, 51)),
    "D4": list(range(51, 68)),
    "D5": list(range(68, 85)),
    "D6": list(range(85, 102)),
}


def detector_for_band(band_index: int) -> str:
    for detector, bands in DETECTOR_ARRAY_BANDS.items():
        if band_index in bands:
            return detector
    return "D1"


def band_for_wavelength_um(wavelength_um: float) -> int:
    return min(
        range(len(SPHEREX_WAVELENGTHS)),
        key=lambda i: abs(SPHEREX_WAVELENGTHS[i] - wavelength_um),
    )


def make_cutout_url(base_url: str, ra: float, dec: float, fov_deg: float) -> str:
    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}center={ra:.5f},{dec:.5f}d&size={fov_deg:.4f}"


class IRSASIAAdapter:
    """Query IRSA SIA2 across both SPHEREx wide-survey collections."""

    def __init__(
        self,
        sia2_url: str = "https://irsa.ipac.caltech.edu/SIA",
        database_url: str = "sqlite+aiosqlite:///./data/skytrace.db",
        timeout: float = 30.0,
        collections: tuple[str, str] = ("spherex_dr1", "spherex_qr3"),
    ) -> None:
        self._url = sia2_url
        self._database_url = database_url
        self._timeout = timeout
        self._collections = collections
        self._cache: dict[str, list[Observation]] = {}
        self._mem_obs: dict[str, Observation] = {}

    async def search(
        self,
        ra: float,
        dec: float,
        radius_deg: float,
        band: int | None = None,
        array: str | None = None,
        simulate: bool = False,
    ) -> list[Observation]:
        """Find SPHEREx observations covering a position.

        Real archive results only, unless the caller explicitly asks for the
        scripted demo sky with ``simulate=True`` (the user's Demo-mode choice).
        """
        if not (0.0 <= ra <= 360.0 and -90.0 <= dec <= 90.0):
            raise ValueError(f"Invalid celestial coordinates: ra={ra}, dec={dec}")
        if radius_deg <= 0.0 or radius_deg > 5.0:
            raise ValueError(f"Radius must be in range (0.0, 5.0], got {radius_deg}")
        if band is not None and not (0 <= band < len(SPHEREX_WAVELENGTHS)):
            raise ValueError(f"Band index must be in range [0, 101], got {band}")
        if array is not None and array not in DETECTOR_ARRAY_BANDS:
            raise ValueError("array must be one of D1, D2, D3, D4, D5, D6")

        cache_key = f"{ra:.4f}_{dec:.4f}_{radius_deg:.4f}_{band}_{array}_{'sim' if simulate else 'live'}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        if simulate:
            demo = self._simulated_observations(ra, dec, radius_deg, band, array)
            self._cache[cache_key] = demo
            return demo

        rows: list[tuple[str, Mapping[str, Any]]] = []
        errors: list[Exception] = []

        try:
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                results = await asyncio.gather(
                    *(
                        self._fetch_collection(client, collection, ra, dec, radius_deg)
                        for collection in self._collections
                    ),
                    return_exceptions=True,
                )
            for collection, result in zip(self._collections, results, strict=True):
                if isinstance(result, Exception):
                    errors.append(result)
                    logger.warning("SIA query failed for %s: %s", collection, result)
                    continue
                rows.extend((collection, row) for row in result)
        except Exception as e:
            errors.append(e)

        observations: list[Observation] = []
        for collection, row in rows:
            observation = self._to_observation(
                row=row,
                collection=collection,
                ra=ra,
                dec=dec,
                fov_deg=radius_deg * 2.0,
                requested_band=band,
            )
            if observation is None:
                continue
            if band is not None and observation.band_index != band:
                continue
            if array is not None and detector_for_band(observation.band_index) != array:
                continue
            observations.append(observation)

        cached_db = await self._find_in_db(ra, dec, radius_deg, band, array)
        if cached_db:
            if not observations:
                observations = cached_db
            elif errors:
                existing_ids = {o.id for o in observations}
                for c_obs in cached_db:
                    if c_obs.id not in existing_ids:
                        observations.append(c_obs)

        # No silent substitution: if every collection failed and no cached data exists, say so.
        if errors and not rows and not observations:
            raise IRSAError(
                "The SPHEREx archive (IRSA) could not be reached or did not answer in time. "
                f"Please try again. ({errors[0]})"
            ) from errors[0]

        observations.sort(
            key=lambda observation: (
                observation.epoch_mjd,
                observation.band_index,
                observation.id,
            )
        )
        if observations:
            self._cache[cache_key] = observations
        for obs in observations:
            self._mem_obs[obs.id] = obs
        await asyncio.gather(*(self._save_to_db(observation) for observation in observations))
        return observations

    def _simulated_observations(
        self,
        ra: float,
        dec: float,
        radius_deg: float,
        band: int | None,
        array: str | None,
    ) -> list[Observation]:
        """Scripted demo sky for Demo mode. Every record is flagged is_simulated."""
        epochs = [
            (60810.0, date(2025, 5, 15), "dr1", 1),
            (60993.0, date(2025, 11, 14), "dr1", 2),
            (61176.0, date(2026, 5, 16), "qr3", 3),
        ]
        target_bands = (
            DETECTOR_ARRAY_BANDS[array]
            if array and array in DETECTOR_ARRAY_BANDS
            else ([band] if band is not None else [10, 26, 43, 60, 77, 94])
        )
        demo: list[Observation] = []
        for mjd, dt, release, pass_num in epochs:
            for b_idx in target_bands:
                obs_id = f"spherex_{release}_{ra:.4f}_{dec:.4f}_pass{pass_num}_b{b_idx}"
                demo.append(
                    Observation(
                        id=obs_id,
                        region_id=f"{ra:.4f}_{dec:.4f}",
                        epoch_mjd=mjd,
                        band_index=b_idx,
                        wavelength_um=SPHEREX_WAVELENGTHS[b_idx],
                        fits_url="",
                        quality_pct=98.0,
                        data_release=release,
                        obs_date=dt,
                        ra=ra,
                        dec=dec,
                        is_simulated=True,
                    )
                )
        demo.sort(key=lambda o: (o.epoch_mjd, o.band_index, o.id))
        return demo

    async def _fetch_collection(
        self,
        client: httpx.AsyncClient,
        collection: str,
        ra: float,
        dec: float,
        radius_deg: float,
    ) -> list[Mapping[str, Any]]:
        params = {
            "COLLECTION": collection,
            "POS": f"CIRCLE {ra:.6f} {dec:.6f} {radius_deg:.6f}",
            "RESPONSEFORMAT": "JSON",
        }
        transient_statuses = {502, 503, 504}
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                response = await client.get(self._url, params=params)
                if response.status_code in transient_statuses:
                    last_error = IRSAError(f"IRSA SIA2 returned HTTP {response.status_code}")
                    if attempt < 1:
                        await asyncio.sleep(0.2 * (2**attempt))
                        continue
                response.raise_for_status()
                return self._extract_rows(response.json())
            except (httpx.HTTPError, ValueError) as error:
                last_error = error
                if attempt < 1:
                    await asyncio.sleep(0.2 * (2**attempt))
        raise IRSAError(f"SIA2 query failed for {collection}") from last_error

    @staticmethod
    def _extract_rows(payload: Any) -> list[Mapping[str, Any]]:
        """Support the two JSON shapes produced by IRSA's VO response layer."""
        if not isinstance(payload, Mapping):
            return []

        data = payload.get("data")
        if isinstance(data, list) and all(isinstance(row, Mapping) for row in data):
            return list(data)

        votable = payload.get("VOTABLE", payload)
        resources = votable.get("RESOURCE_ARRAY", []) if isinstance(votable, Mapping) else []
        if isinstance(votable, Mapping) and "RESOURCE" in votable and not resources:
            r = votable.get("RESOURCE")
            resources = [r] if isinstance(r, Mapping) else (r if isinstance(r, list) else [])

        rows: list[Mapping[str, Any]] = []
        for resource in resources if isinstance(resources, list) else []:
            table = resource.get("TABLE", {}) if isinstance(resource, Mapping) else {}
            fields = (
                table.get("FIELD_ARRAY")
                or table.get("FIELD")
                or []
            ) if isinstance(table, Mapping) else []
            field_names = [
                (field.get("<xmlattr>", {}).get("name") if isinstance(field.get("<xmlattr>"), Mapping) else None)
                or field.get("@name")
                or field.get("name")
                for field in fields
                if isinstance(field, Mapping)
            ]
            data_elem = table.get("DATA", {}) if isinstance(table, Mapping) else {}
            table_data = data_elem.get("TABLEDATA", []) if isinstance(data_elem, Mapping) else []
            for row in table_data if isinstance(table_data, list) else []:
                if isinstance(row, list) and len(row) == len(field_names):
                    rows.append(dict(zip(field_names, row, strict=True)))
        return rows

    def _to_observation(
        self,
        row: Mapping[str, Any],
        collection: str,
        ra: float,
        dec: float,
        fov_deg: float,
        requested_band: int | None,
    ) -> Observation | None:
        access_url = str(row.get("access_url") or "").strip()
        if not access_url:
            return None

        obs_id = str(row.get("obs_id") or "").strip()
        if not obs_id:
            obs_id = f"spherex_{collection}_{ra:.4f}_{dec:.4f}"

        epoch_mjd = self._parse_epoch_mjd(row)
        wavelength_um = self._parse_wavelength_um(row, requested_band)
        band_index = (
            requested_band
            if requested_band is not None
            else band_for_wavelength_um(wavelength_um)
        )
        cutout_url = make_cutout_url(access_url, ra=ra, dec=dec, fov_deg=fov_deg)

        obs_date_value = row.get("obs_date")
        if isinstance(obs_date_value, str) and obs_date_value.strip():
            try:
                obs_date = date.fromisoformat(obs_date_value.strip()[:10])
            except ValueError:
                obs_date = self._mjd_to_date(epoch_mjd)
        else:
            obs_date = self._mjd_to_date(epoch_mjd)

        return Observation(
            id=obs_id,
            region_id=f"{ra:.4f}_{dec:.4f}",
            epoch_mjd=epoch_mjd,
            band_index=band_index,
            wavelength_um=wavelength_um,
            fits_url=cutout_url,
            quality_pct=float(row.get("quality_pct", 98.0)),
            data_release=collection.removeprefix("spherex_"),
            obs_date=obs_date,
            ra=float(row.get("s_ra", ra)),
            dec=float(row.get("s_dec", dec)),
        )

    @staticmethod
    def _parse_epoch_mjd(row: Mapping[str, Any]) -> float:
        for key in ("t_min", "t_max", "mjd-obs", "mjd_obs", "time"):
            value = row.get(key)
            if value is None:
                continue
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
        return 60430.0

    @staticmethod
    def _parse_wavelength_um(row: Mapping[str, Any], requested_band: int | None) -> float:
        for key in ("em_min", "em_max", "wavelength_um", "wavelength"):
            value = row.get(key)
            if value is None:
                continue
            try:
                numeric = float(value)
                return numeric * 1e6 if numeric < 0.1 else numeric
            except (TypeError, ValueError):
                continue
        if requested_band is not None and 0 <= requested_band < len(SPHEREX_WAVELENGTHS):
            return SPHEREX_WAVELENGTHS[requested_band]
        return 2.5

    @staticmethod
    def _mjd_to_date(epoch_mjd: float) -> date:
        return date(2025, 5, 1) + timedelta(days=max(0, int(epoch_mjd - 60400.0)))

    async def get_by_id(self, obs_id: str) -> Observation | None:
        if obs_id in self._mem_obs:
            return self._mem_obs[obs_id]
        try:
            factory = get_session_factory()
            if factory is None:
                await create_tables(self._database_url)
                factory = get_session_factory()
            if factory:
                async with factory() as session:
                    row = (
                        await session.execute(
                            select(ObservationModel).where(ObservationModel.id == obs_id)
                        )
                    ).scalar_one_or_none()
                    if row:
                        return Observation(
                            id=row.id,
                            region_id=row.region_id,
                            epoch_mjd=row.epoch_mjd,
                            band_index=row.band_index,
                            wavelength_um=row.wavelength_um,
                            fits_url=row.fits_url,
                            quality_pct=row.quality_pct,
                            data_release=row.data_release,
                            obs_date=self._mjd_to_date(row.epoch_mjd),
                            ra=row.ra,
                            dec=row.dec,
                            is_simulated=is_simulated_obs_id(row.id),
                        )
        except Exception:
            pass
        return None

    async def _save_to_db(self, obs: Observation) -> None:
        # Never persist fabricated records: they would look like archive data
        # the next time they are read back.
        if obs.is_simulated:
            return
        try:
            factory = get_session_factory()
            if factory is None:
                await create_tables(self._database_url)
                factory = get_session_factory()
            if factory:
                async with factory() as session:
                    existing = (
                        await session.execute(
                            select(ObservationModel).where(ObservationModel.id == obs.id)
                        )
                    ).scalar_one_or_none()
                    if existing is None:
                        session.add(
                            ObservationModel(
                                id=obs.id,
                                region_id=obs.region_id,
                                epoch_mjd=obs.epoch_mjd,
                                band_index=obs.band_index,
                                wavelength_um=obs.wavelength_um,
                                fits_url=obs.fits_url,
                                quality_pct=obs.quality_pct,
                                data_release=obs.data_release,
                                ra=obs.ra,
                                dec=obs.dec,
                            )
                        )
                        await session.commit()
        except Exception:
            pass

    async def _find_in_db(
        self,
        ra: float,
        dec: float,
        radius_deg: float,
        band: int | None = None,
        array: str | None = None,
    ) -> list[Observation]:
        try:
            factory = get_session_factory()
            if factory is None:
                await create_tables(self._database_url)
                factory = get_session_factory()
            if not factory:
                return []
            async with factory() as session:
                region_pattern = f"{ra:.4f}_{dec:.4f}"
                stmt = select(ObservationModel).where(
                    (ObservationModel.region_id == region_pattern)
                    | (
                        (ObservationModel.ra >= ra - radius_deg)
                        & (ObservationModel.ra <= ra + radius_deg)
                        & (ObservationModel.dec >= dec - radius_deg)
                        & (ObservationModel.dec <= dec + radius_deg)
                    )
                )
                if band is not None:
                    stmt = stmt.where(ObservationModel.band_index == band)
                result = await session.execute(stmt)
                db_rows = result.scalars().all()
                obs_list: list[Observation] = []
                for row in db_rows:
                    if array is not None and detector_for_band(row.band_index) != array:
                        continue
                    obs_list.append(
                        Observation(
                            id=row.id,
                            region_id=row.region_id,
                            epoch_mjd=row.epoch_mjd,
                            band_index=row.band_index,
                            wavelength_um=row.wavelength_um,
                            fits_url=row.fits_url,
                            quality_pct=row.quality_pct,
                            data_release=row.data_release,
                            obs_date=self._mjd_to_date(row.epoch_mjd),
                            ra=row.ra,
                            dec=row.dec,
                            is_simulated=is_simulated_obs_id(row.id),
                        )
                    )
                return obs_list
        except Exception:
            return []

