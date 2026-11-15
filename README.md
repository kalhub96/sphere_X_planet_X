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
| **Viewing modes** | Video loop, Blink (A/B), Split slider, Difference (Epoch N − Epoch 1), **Add / subtract epochs** and **False colour (3 real bands)**. |
| **Add / subtract epochs** | Tick which epochs to add (median stack) and which to subtract; the result is a signal-to-noise difference image (red = brighter in the added set, blue = brighter in the subtracted set). |
| **False colour** | Three detector arrays of one epoch become red / green / blue (default D6 / D3 / D1, i.e. long → short wavelength), so colour means real wavelength. |
| **Detector arrays & bands** | Pick one of the 102 bands, or stack a whole detector array (D1–D6, 0.75–5.0 µm) to improve signal-to-noise. |
| **Field of view** | Any value from 0.01° to 1.0°, typed in or picked from presets. Larger fields keep fast movers in frame at the cost of longer downloads. |
| **Shareable URLs** | `?ra=&dec=&fov=&array=&band=&mode=&plus=&minus=&demo=` restores the exact view, so it can be embedded or shared. |
| **Cross-mission overlay** | Aladin Lite panel showing Gaia DR3 sources over 2010–2014 unWISE infrared imagery. |
| **Quality metadata** | Per-frame clean-pixel percentage and flagged-pixel counts from the FITS `FLAGS` plane. |
| **Candidates & evidence** | Difference-image source detection, confidence scoring, Solar System (MOST) cross-match and an evidence panel with caveats. |
| **On-the-fly 102-band spectrum (SED)** | Extracts circular aperture photometry (`r = 2.5 px`, background annulus `4–7 px`) from SPHEREx FITS cutouts across detector arrays `D1`–`D6` and fits 102-band spectral templates (`Y-Dwarf`, `Methane Ice / Planet X`, `Comet`, `High-z Galaxy`). |

Data comes from the NASA/IPAC Infrared Science Archive (IRSA): the backend queries the
SPHEREx `spherex_dr1` and `spherex_qr3` collections through the IVOA SIA2 service and
downloads small server-side cutouts instead of full images, so new releases show up
without code changes.

---

## Data honesty: real by default, demo only when you ask

SkyTrace shows **real SPHEREx data from the IRSA archive**. It never substitutes made-up
images because the archive is slow.

- If IRSA is slow or unreachable you get a clear error (HTTP `503`) with a **Try again** button,
  not fake frames. Slow requests are given a generous timeout (30 s for the search, 60 s per
  cutout, one retry) and cached once they succeed.
- If only some epochs can be downloaded, the real ones are shown and the missing ones are listed
  in a `warnings` list on screen. Nothing is filled in.
- **Demo mode** is an opt-in checkbox in the viewer (URL `demo=1`, API `simulate=true`). It plays
  a scripted simulated sky for the five benchmark targets so the interface can be tried without
  the archive. While it is on, a banner says *“Demo mode · simulated sky, not real SPHEREx
  images”*, every frame is badged, and `is_simulated: true` / `data_source: "simulated"` appear in
  the API. Simulated data is never written to the database.

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


---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend URL used by the frontend. |
| `IRSA_QUERY_TIMEOUT_SECONDS` | `30` | How long to wait for IRSA to answer a search. |
| `IRSA_CUTOUT_TIMEOUT_SECONDS` | `60` | How long to wait for each FITS cutout download. |
| `IRSA_SIA2_URL` | `https://irsa.ipac.caltech.edu/SIA` | IRSA SIA2 service. |
| `REDIS_URL` | `redis://localhost:6379` | Optional cache. |
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/skytrace.db` | Observation / candidate store. |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | CORS origins. |

---

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/observations?ra=&dec=&fov=&band=&array=` | SPHEREx exposures covering a position. |
| `GET /api/v1/epochs?ra=&dec=&fov=&band=&array=&stretch=&simulate=` | Chronological frames (PNG), difference image, candidates, `data_source`, `warnings`. |
| `GET /api/v1/epochs/combine?ra=&dec=&fov=&plus=1,2&minus=3&array=` | Add and/or subtract epochs you choose; returns a stack or a difference image. |
| `GET /api/v1/falsecolor?ra=&dec=&fov=&red=D6&green=D3&blue=D1&epoch=` | Real three-band RGB composite from one epoch. |
| `GET /api/v1/compare?obs_a=&obs_b=&band=` | Two-observation comparison with difference image and candidates. |
| `GET /api/v1/candidates/{id}/evidence` | Plain-language evidence, measurements and caveats. |
| `GET /api/v1/candidates/{id}/sed?ra=&dec=&simulate=` | On-the-fly 102-band SED combining FITS aperture photometry across `D1`–`D6` with physical template fitting. |
| `GET /api/v1/most-check?ra=&dec=&epoch_mjd=` | Solar System cross-match (IRSA MOST). |
| `GET /api/v1/wavelengths` | The 102 SPHEREx bands and detector arrays. |

URL parameters for the viewer: `ra`, `dec` (degrees), `fov` (degrees, 0.01–1.0),
`array` (`D1`–`D6` or `single`), `band` (0–101), `mode` (`video`, `blink`, `slider`, `difference`, `combine`, `false_color`),
`plus` / `minus` (epoch numbers, e.g. `plus=3&minus=1`), `demo=1` (Demo mode).

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

- **Live archive path:** the real-data code was developed and tested against recorded fixtures,
  not against the live IRSA service. Before presenting results, open WISE 0855 with Demo mode
  **off** and confirm real frames and `data_source: "live"`.
- **Spectrum (SED) sampling:** To keep interactive response times fast, the backend extracts live aperture photometry from representative exposures across each of the 6 detector arrays (`D1`–`D6`, up to 12 FITS cutouts per query) and interpolates the remaining channels using the best-fit physical continuum.
- **Band → wavelength table** is a log-spaced approximation of the 102 SPHEREx bands, not the
  per-pixel wavelength map from the FITS headers.
- **Demo mode** is a scripted simulation, not a prediction of what SPHEREx will see.
- Automated detections are a starting point for human inspection, not confirmed discoveries.

---

## Data and credits

- **NASA/IPAC Infrared Science Archive (IRSA)** — SPHEREx data (DR1 and QR3 collections) and the MOST Solar System search.
- **ESA Gaia** (DR3) catalogue and **NASA WISE / unWISE** imagery, displayed through **Aladin Lite** from CDS, Strasbourg.
- Built with Astropy, reproject, photutils, FastAPI, Next.js, React and Chart.js.

NASA does not endorse this project. Please cite the SPHEREx data according to IRSA's current guidance.
