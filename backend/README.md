# SkyTrace Backend

FastAPI service behind SkyTrace: it finds SPHEREx observations for a position on the sky
(NASA/IPAC IRSA, IVOA SIA2), downloads small FITS cutouts, aligns and stacks them with
Astropy / reproject, and returns display-ready frames, difference images and candidate sources.

Built with FastAPI, Astropy, PyVO, SciPy, Reproject, Photutils and SQLAlchemy.

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Interactive API docs: <http://localhost:8000/docs>. Redis is optional (in-memory fallback).

## Real vs. simulated data

The service returns real IRSA data or an honest error (`503` if the archive cannot be reached,
`404` if nothing covers the position). It never falls back to fake data on its own. Passing
`simulate=true` on `/observations`, `/epochs`, `/epochs/combine` or `/falsecolor` explicitly
requests the scripted demo sky; those frames carry `is_simulated: true` and are never stored in
the database. Timeouts are set with `IRSA_QUERY_TIMEOUT_SECONDS` and `IRSA_CUTOUT_TIMEOUT_SECONDS`.
See the root README for details.

## Test

```bash
pytest
python scripts/verify_benchmarks.py   # hits the live archive for the 5 challenge targets
```
