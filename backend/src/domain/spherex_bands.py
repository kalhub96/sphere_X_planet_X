"""SPHEREx band -> wavelength. 6 arrays x 17 channels, log-spaced inside each array.
Source: Spectral response of SPHEREx (arXiv:2602.09139) Table 1, Eqs. 1-2."""
ARRAY_EDGES_UM = (0.75, 1.11, 1.64, 2.42, 3.82, 4.42, 5.00)


def band_center_um(band0: int) -> float:
    """Centre wavelength (um) of zero-indexed band 0..101."""
    i = max(0, min(101, int(band0)))
    a, c = divmod(i, 17)
    lo, hi = ARRAY_EDGES_UM[a], ARRAY_EDGES_UM[a + 1]
    return lo * (hi / lo) ** ((c + 0.5) / 17)
