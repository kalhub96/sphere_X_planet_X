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

If IRSA is slow or unreachable the service can return a **labelled offline demo**
(`is_simulated: true` on observations/frames, `data_source` on `/api/v1/epochs`).
Disable it with `ALLOW_SIMULATED_DATA=false` to get a `503` instead. Simulated records are
never stored in the database. See the root README for details.

## Test

```bash
pytest
python scripts/verify_benchmarks.py   # hits the live archive for the 5 challenge targets
```
