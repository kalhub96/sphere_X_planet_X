# prompt.md — Copy-Paste Prompts for Your AI Coding Agent

Use **Prompt 1** to kick off autonomous execution, followed by **Prompts 2–4** if running modular agent passes.

---

## Prompt 1: Master End-to-End Autonomous Build Prompt
> Read `AGENTS.md`, `skills.md`, `command.md`, `benchmarks.md`, `judging-rubric.md`, `blueprint.md`, and `implementation_plan.md` completely before writing any code.
>
> Your task is to build and verify **SkyTrace** for the **2026 NASA Space Apps Challenge ("Planet X and SPHEREx")**.
>
> Execute the workflow in `command.md` sequentially:
> 1. **Patch & Build Backend (`/bootstrap` -> `/verify-irsa` -> `/build-backend`):**
>    - Use IRSA's VO SIA2 endpoint `https://irsa.ipac.caltech.edu/SIA` querying both `spherex_dr1` and `spherex_qr3`.
>    - Fix the dependency injection stubs in `implementation_plan.md` so `SQLiteCandidateRepository`, `IRSAMostAdapter`, and `WCSHeader` serialization work end-to-end with zero `None` dependencies.
>    - Add `GET /api/v1/epochs` returning chronologically grouped SPHEREx cutouts (supporting both individual bands `1..102` and detector-array median coadds `D1`–`D6`, user-selectable `fov`, and `AsinhStretch` / `ZScale` / `Log` stretches) plus `FLAGS` bitmask metadata.
>    - Add graceful in-memory cache fallback if Redis is not running.
> 2. **Build Frontend (`/build-frontend`):**
>    - Implement the 5 mandatory benchmark preset buttons (`Barnard's Star`, `Epsilon Indi B`, `WISE 0855`, `RW Aurigae`, `R Draconis`) at the top of the explorer/viewer so judges can test them in one click.
>    - Upgrade `BlinkViewer.tsx` to support N-epoch `VIDEO LOOP` playback (play/pause, FPS control, timeline scrubber), `BLINK`, `SLIDER`, `DIFFERENCE`, and `FALSE COLOR` modes, plus click-on-source 102-band SED extraction.
>    - Embed synchronized **Aladin Lite v3** (`unWISE` + `Gaia DR3`) comparison view for cross-mission verification.
>    - Sync all search parameters (`ra`, `dec`, `fov`, `array`, `band`, `mode`) with URL query parameters.
>    - Include the interactive Three.js `CelestialSphere` hero and `EvidencePanel` with confidence gauge, parallax distance calculator, MOST cross-match badge, and mandatory scientific caveats.
> 3. **Verify & Pre-Warm (`/test-benchmarks` -> `/prewarm-cache`):**
>    - Write and run `backend/scripts/verify_benchmarks.py` against all 5 challenge targets in `benchmarks.md` and fix any issues until all 5 pass.

---

## Prompt 2: Backend FITS & Multi-Epoch Coaddition Specialist Prompt
> Focus strictly on `backend/`. Implement `IRSASIAAdapter`, `IRSAIBEAdapter`, `AstropyFITSAdapter`, `NumpyImageProcessor`, and `SpectralExtractor` following `skills.md` (`irsa-spherex-sia2-pipeline` and `lvf-wavelength-and-detector-coadd`).
> Ensure:
> - Querying `https://irsa.ipac.caltech.edu/SIA` with `COLLECTION=spherex_dr1` and `COLLECTION=spherex_qr3` groups observations into distinct ~6-month sky passes (`epoch_index`, `mjd_mean`, `obs_date`).
> - Detector array mode (`D1` through `D6`) reprojects all overlapping channels in that detector onto the epoch reference WCS and computes a `FLAGS`-masked median stack (`np.nanmedian`) so faint sources like WISE 0855 (`D5`/`D6`, 3.58–5.00 µm) achieve maximum SNR.
> - `CompareResponse` and `EpochsResponse` return the exact `WCSHeader` (`CRPIX1`, `CRPIX2`, `CRVAL1`, `CRVAL2`, `CD1_1`, `CD1_2`, `CD2_1`, `CD2_2`) and decoded `FLAGS` counts (`clean_pct`, `cosmic_ray_px`, `saturated_px`, `bad_px`).

---

## Prompt 3: Frontend Blink Video, Aladin Lite & SED Specialist Prompt
> Focus strictly on `frontend/`. Build the investigation workspace with our deep-space glassmorphism theme (`globals.css` variables) and URL query synchronization (`?ra=&dec=&fov=&array=&band=&mode=`).
> - Add a sticky **Challenge Benchmark Bar** with one-click presets for **Barnard's Star**, **Epsilon Indi B**, **WISE 0855** (auto-selecting Detector `D6`), **RW Aurigae**, and **R Draconis**.
> - In `BlinkViewer.tsx`, render a smooth `< 16ms` HTML5 Canvas flipbook that loops through all `N` epochs like a video, displays an epoch progress bar + MJD timestamp + wavelength HUD, supports `Space` (play/pause) and `Left/Right` arrow stepping, and renders WCS-projected candidate circles.
> - Add a toggleable **Gaia DR3 + unWISE (Aladin Lite)** split/overlay panel locked to the current `(RA, Dec, FOV)` so users can compare 2010–2014 WISE positions against 2025–2026 SPHEREx frames.

---

## Prompt 4: Pre-Submission Audit & Demo Readiness Prompt
> Audit the entire codebase against `judging-rubric.md`.
> 1. Verify no hardcoded mock data is served anywhere in production routes.
> 2. Verify every candidate displays the scientific caveats, contamination flags, and IRSA data citation (`DOI: 10.26131/IRSA662` & SPHEREx DR1).
> 3. Run `uv run pytest`, `uv run mypy src/`, `npx tsc --noEmit`, and `scripts/verify_benchmarks.py`.
> 4. Output a verification summary table with actual measured epoch counts, SNR values, and response latencies for all 5 benchmark targets.
