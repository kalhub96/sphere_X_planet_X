"""Group SPHEREx exposures into survey epochs (one pass of the sky, ~6 months apart)."""

from __future__ import annotations

from collections.abc import Sequence

from ..entities.observation import Observation

# Exposures of the same sky pass land within a couple of weeks of each other.
EPOCH_WINDOW_DAYS = 15.0


def cluster_epochs(
    observations: Sequence[Observation],
    window_days: float = EPOCH_WINDOW_DAYS,
) -> list[list[Observation]]:
    """Return observations grouped by survey epoch, in chronological order.

    Epoch numbers used throughout the API are 1-based positions in this list.
    """
    clusters: list[list[Observation]] = []
    for obs in sorted(observations, key=lambda o: o.epoch_mjd):
        for cluster in clusters:
            mean_mjd = sum(o.epoch_mjd for o in cluster) / len(cluster)
            if abs(obs.epoch_mjd - mean_mjd) <= window_days:
                cluster.append(obs)
                break
        else:
            clusters.append([obs])
    return clusters
