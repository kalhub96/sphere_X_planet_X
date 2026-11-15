"""Shared helpers for turning survey epochs into images (used by several routers)."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from datetime import date, timedelta

from src.domain.entities.fits_image import FITSImage
from src.domain.entities.observation import Observation
from src.domain.exceptions import IRSAError, NoDataError

# At most this many exposures are stacked per epoch and detector array.
MAX_EXPOSURES_PER_STACK = 5


async def fetch_stack(ibe, processor, observations: Sequence[Observation]) -> FITSImage:
    """Download the given exposures and median-stack them into one image.

    Exposures that fail to download are skipped; if none succeed the error is
    raised (real data or an honest error, never invented pixels).
    """
    chosen = list(observations)[:MAX_EXPOSURES_PER_STACK]
    results = await asyncio.gather(
        *(ibe.fetch(o.id, band=o.band_index) for o in chosen),
        return_exceptions=True,
    )
    images = [r for r in results if isinstance(r, FITSImage)]
    errors = [r for r in results if isinstance(r, Exception)]
    if not images:
        if errors:
            raise errors[0]
        raise NoDataError("No exposures were available to stack.")
    return await processor.coadd_detector_array(images)


async def load_epoch_image(
    ibe,
    processor,
    cluster: Sequence[Observation],
    *,
    array: str | None,
    band: int | None,
) -> FITSImage:
    """Image for one survey epoch: a detector-array stack, or a single band."""
    if array:
        return await fetch_stack(ibe, processor, cluster)
    target = cluster[0]
    return await ibe.fetch(target.id, band=band if band is not None else target.band_index)


def parse_epoch_list(value: str | None) -> list[int]:
    """Parse "1,3" into [1, 3]; raises ValueError on junk."""
    if not value:
        return []
    items = [part.strip() for part in value.split(",") if part.strip()]
    numbers = [int(part) for part in items]
    if any(n < 1 for n in numbers):
        raise ValueError("epoch numbers start at 1")
    return sorted(set(numbers))


ARCHIVE_ERRORS = (IRSAError, NoDataError)


_MJD_ZERO = date(1858, 11, 17)


def mjd_to_iso(mjd: float) -> str:
    """Modified Julian Date -> ISO calendar date (UTC)."""
    return (_MJD_ZERO + timedelta(days=int(mjd))).isoformat()
