# SkyTrace — Planet X & SPHEREx

A public web tool for **watching the sky change over time** in images from NASA's
[SPHEREx](https://science.nasa.gov/mission/spherex/) mission. Type in a position
(RA/Dec) or pick a target, and SkyTrace plays the SPHEREx images of that patch of
sky like a short video, so moving objects (brown dwarfs, asteroids, comets, nearby
stars) and changing ones (variable stars) stand out.

Built for the **2026 NASA Space Apps Challenge: "Planet X and SPHEREx"**.

> **The 5 challenge targets are one click away:** Barnard's Star, Epsilon Indi B,
> WISE 0855, RW Aurigae and R Draconis.

---

## What it does

| Feature | Details |
| --- | --- |
| **Coordinate input** | Decimal degrees (`133.7951, -7.2451`) or sexagesimal (`08h55m10.831s, -7d14m42.53s`), plus name lookup. |
| **Time-series "video"** | Plays every SPHEREx epoch for the patch with play/pause, adjustable FPS and a frame scrubber. |
| **Viewing modes** | Video loop, Blink (A/B), Split slider, Difference (Epoch N − Epoch 1) and False colour. |
| **Detector arrays & bands** | Pick one of the 102 bands, or stack a whole detector array (D1–D6, 0.75–5.0 µm) to improve signal-to-noise. |
| **Field of view** | Presets from 0.05° to 0.50°. Larger fields keep fast movers in frame at the cost of longer downloads. |
| **Shareable URLs** | `?ra=&dec=&fov=&array=&band=&mode=` restores the exact view, so it can be embedded or shared. |
| **Cross-mission overlay** | Aladin Lite panel showing Gaia DR3 sources over 2010–2014 unWISE infrared imagery. |
| **Quality metadata** | Per-frame clean-pixel percentage and flagged-pixel counts from the FITS `FLAGS` plane. |
| **Candidates & evidence** | Difference-image source detection, confidence scoring, Solar System (MOST) cross-match and an evidence panel with caveats. |
| **Spectrum view** | 102-band spectral-energy-distribution plot with template overlays (see *Known limitations*). |

Data comes from the NASA/IPAC Infrared Science Archive (IRSA): the backend queries the
SPHEREx `spherex_dr1` and `spherex_qr3` collections through the IVOA SIA2 service and
downloads small server-side cutouts instead of full images, so new releases show up
without code changes.

---

## Data honesty: real vs. simulated

SkyTrace shows **real SPHEREx data whenever the IRSA archive responds in time**.

If the archive is slow, unreachable, or returns too few observations, the backend can fall back to an
**offline demo mode** that generates synthetic observations and images (random noise plus
scripted moving/variable sources for the five benchmark targets). Demo data is **never**
silently mixed in:

- every simulated observation and frame carries `is_simulated: true` in the API;
- `GET /api/v1/epochs` returns `data_source` = `"live"`, `"mixed"` or `"simulated"`;
- the UI shows an amber **“Simulated demo data — not real SPHEREx images”** banner and a
  **SIMULATED** badge on each affected frame;
- simulated records are never written to the database, and simulated responses are cached for
  only 5 minutes so real data replaces them as soon as the archive is back.

To turn the fallback **off** (recommended for any scientific use) and get an honest `503` error
instead, set the environment variable:

```bash
ALLOW_SIMULATED_DATA=false
```

---

## Quick start

You need **Python 3.12+** and **Node.js 20+**. Redis is optional (the backend uses an
in-memory cache if Redis is not running).

### 1. Backend (FastAPI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Check it: <http://localhost:8000/health> and the interactive docs at <http://localhost:8000/docs>.

### 2. Frontend (Next.js)

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev    # Windows PowerShell: $env:NEXT_PUBLIC_API_URL="http://localhost:8000"; npm run dev
```

Open <http://localhost:3000>.

### Or with Docker

```bash
docker compose up --build
```

Frontend on port 3000, backend on port 8000, Redis on 6379.

> **Note:** the Next.js files at the repository root (`package.json`, `next.config.ts`,
> `tsconfig.json`) are an unused leftover of the project template. The real app lives in
> `frontend/` and `backend/`.

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend URL used by the frontend. |
| `ALLOW_SIMULATED_DATA` | `true` | Allow the labelled offline demo fallback. Set `false` to disable it. |
| `IRSA_SIA2_URL` | `https://irsa.ipac.caltech.edu/SIA` | IRSA SIA2 service. |
| `REDIS_URL` | `redis://localhost:6379` | Optional cache. |
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/skytrace.db` | Observation / candidate store. |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | CORS origins. |

---

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/observations?ra=&dec=&fov=&band=&array=` | SPHEREx exposures covering a position. |
| `GET /api/v1/epochs?ra=&dec=&fov=&band=&array=&stretch=` | Chronological frames (PNG), difference image, candidates, `data_source`. |
| `GET /api/v1/compare?obs_a=&obs_b=&band=` | Two-observation comparison with difference image and candidates. |
| `GET /api/v1/candidates/{id}/evidence` | Plain-language evidence, measurements and caveats. |
| `GET /api/v1/candidates/{id}/sed` | Template spectrum for a candidate (illustrative, see below). |
| `GET /api/v1/most-check?ra=&dec=&epoch_mjd=` | Solar System cross-match (IRSA MOST). |
| `GET /api/v1/wavelengths` | The 102 SPHEREx bands and detector arrays. |

URL parameters for the viewer: `ra`, `dec` (degrees), `fov` (0.05, 0.08, 0.15, 0.25, 0.5),
`array` (`D1`–`D6` or `single`), `band` (0–101), `mode` (`video`, `blink`, `slider`, `difference`, `false_color`).

Example: `http://localhost:3000/compare?ra=133.7951&dec=-7.2451&fov=0.08&array=D6&mode=difference`

---

## Challenge benchmark targets

| Target | RA, Dec (J2000, deg) | Why it is interesting |
| --- | --- | --- |
| Barnard's Star | 269.4521, +4.6934 | Fastest known proper motion (about 10.4″/yr). |
| Epsilon Indi B | 331.0438, −56.7828 | Brown-dwarf pair moving across the sky. |
| WISE 0855 | 133.7951, −7.2451 (08h55m10.831s, −7°14′42.53″) | Very cold, fast-moving brown dwarf; brightest at long wavelengths. |
| RW Aurigae | 76.9564, +30.4014 | Irregular variable star. |
| R Draconis | 248.1633, +66.7539 | Mira-type pulsating variable. |

Presets live in `frontend/app/config/benchmarks.ts`; more detail in [`benchmarks.md`](benchmarks.md).

---

## Project layout

```text
backend/    FastAPI service (domain / application / infrastructure layers)
  src/infrastructure/adapters/   IRSA SIA2 + cutout download, FITS parsing, image processing
  src/infrastructure/api/v1/     HTTP routers and response schemas
  scripts/                       benchmark verification and cache pre-warming
  tests/                         unit and API integration tests
frontend/   Next.js app
  app/compare/                   main viewer page (/explore redirects here)
  app/components/                BlinkViewer, Aladin overlay, SED chart, evidence panel
  app/lib/                       coordinate parsing, WCS, spectral templates
```

Tests: `cd backend && pytest`. Type-check the frontend: `cd frontend && npx tsc --noEmit`.

---

## Known limitations

- **Demo fallback:** see *Data honesty*. Verify a demo of the five targets shows
  `data_source: "live"` before presenting results as real observations.
- **False-colour view** is illustrative; it is not yet built from three independent real bands.
- **Spectrum (SED) plot** currently shows generated template spectra, labelled
  *“Illustrative · not measured”*, rather than photometry measured from the images.
- **Field of view** is limited to the preset values.
- Automated detections are a starting point for human inspection, not confirmed discoveries.

---

## Data and credits

- **NASA/IPAC Infrared Science Archive (IRSA)** — SPHEREx data (DR1 and QR3 collections) and the MOST Solar System search.
- **ESA Gaia** (DR3) catalogue and **NASA WISE / unWISE** imagery, displayed through **Aladin Lite** from CDS, Strasbourg.
- Built with Astropy, reproject, photutils, FastAPI, Next.js, React and Chart.js.

NASA does not endorse this project. Please cite the SPHEREx data according to IRSA's current guidance.
