# command.md — SkyTrace Agent Execution & Verification Commands

Run these deterministic workflows in order. Do not proceed to the next command until the current command's verification gate passes.

---

## `/bootstrap` — Initialize & Verify Toolchain
```bash
# 1. Verify Python 3.12+, uv, Node 20+, and Docker
python --version && uv --version && node --version

# 2. Sync backend environment
cd backend && uv sync

# 3. Install frontend dependencies (Three.js + Chart.js + Zustand + TanStack Query + Radix)
cd ../frontend && npm install three @types/three chart.js d3 @types/d3 framer-motion zustand @tanstack/react-query @radix-ui/react-dialog @radix-ui/react-slider @radix-ui/react-tabs @radix-ui/react-tooltip
```

**Gate:** `uv run python -c "import fastapi, astropy, pyvo, reproject, photutils; print('BACKEND_DEPS_OK')"` prints `BACKEND_DEPS_OK`.

---

## `/verify-irsa` — Validate Live SPHEREx DR1 & QR3 Access

```bash
cd backend && uv run python -c "
import requests
for col in ('spherex_dr1', 'spherex_qr3'):
    r = requests.get('https://irsa.ipac.caltech.edu/SIA', params={
        'COLLECTION': col,
        'POS': 'circle 133.7951 -7.2451 0.08',
        'RESPONSEFORMAT': 'JSON'
    }, timeout=20).json()
    print(col, 'rows:', len(r.get('data', [])))
"
```

**Gate:** Both `spherex_dr1` and `spherex_qr3` return `rows > 0` without HTTP errors.

---

## `/build-backend` — Implement & Wire Hexagonal Backend

1. Implement domain entities & services (`CoordinateService`, `ParallaxCalculator`, `ConfidenceScorer`, `SpectralTemplateFitter`, `ArtifactChecker`).
2. Implement `IRSASIAAdapter` querying `https://irsa.ipac.caltech.edu/SIA` across `spherex_dr1` + `spherex_qr3` and persisting `obs_id -> fits_url` in SQLite.
3. Implement `IRSAIBEAdapter` fetching `?center={ra},{dec}d&size={fov}` cutouts with in-memory + Redis caching.
4. Implement multi-epoch coadd & difference pipeline in `NumpyImageProcessor` (supporting single band `1..102` and detector array median stacks `D1`–`D6`).
5. Implement endpoints:
   - `GET /api/v1/observations?ra=&dec=&radius=&array=&band=`
   - `GET /api/v1/epochs?ra=&dec=&fov=&array=&band=&stretch=` (returns ordered chronological PNG frames + WCS + flag summary for video flipbook)
   - `GET /api/v1/compare?obs_a=&obs_b=&band=` (returns real `WCSHeader`, `image_a_b64`, `image_b_b64`, `difference_b64`, `falsecolor_b64`, `candidates`)
   - `GET /api/v1/candidates/{id}/evidence` & `GET /api/v1/candidates/{id}/sed`
   - `GET /api/v1/most-check?ra=&dec=&epoch_mjd=`

6. Run static checks and unit tests:
```bash
cd backend && uv run ruff check src/ && uv run mypy src/ && uv run pytest tests/ -v
```

**Gate:** 0 ruff errors, 0 mypy errors, 100% pytest pass.

---

## `/build-frontend` — Implement Investigation UI & 3D Sphere

1. Create `frontend/app/config/benchmarks.ts` with the 5 mandatory targets from `benchmarks.md`.
2. Build `BlinkViewer.tsx` supporting:
   - `VIDEO LOOP` (plays all `N` epochs sequentially with FPS slider, play/pause, frame scrubber)
   - `A/B BLINK`, `SPLIT SLIDER`, `DIFFERENCE (Epoch N - Epoch 1)`, and `FALSE COLOR (D6/D4/D1 RGB)`
   - WCS candidate overlays + contamination flag badges
3. Build `AladinOverlay.tsx` embedding Aladin Lite v3 with `unWISE` + `Gaia DR3` synced to `(ra, dec, fov)`.
4. Build `SEDChart.tsx` (Chart.js 102-band flux vs. wavelength with methane ice, Y-dwarf, galaxy, and comet template fits).
5. Build `CelestialSphere.tsx` (Three.js interactive sky sphere + SPHEREx scan ring + orrery).
6. Sync URL query parameters (`?ra=&dec=&fov=&array=&band=&mode=`) in `useSkyStore.ts`.
7. Typecheck frontend:
```bash
cd frontend && npx tsc --noEmit
```

**Gate:** `tsc --noEmit` exits with code `0`.

---

## `/test-benchmarks` — End-to-End Verification on All 5 Challenge Targets

Run automated verification script against running backend (`http://localhost:8000`) for all 5 targets in `benchmarks.md`:

```bash
cd backend && uv run python scripts/verify_benchmarks.py
```

**Gate:** All 5 targets return `>= 2` epochs, valid base64 PNG frames, valid WCS headers, and expected variability/motion metrics.

---

## `/prewarm-cache` — Warm Cache Before Demo / Submission

```bash
cd backend && uv run python scripts/prewarm_benchmarks.py
```

**Gate:** All 5 benchmark regions cached in SQLite/Redis so live demo responses return in `< 100ms`.
