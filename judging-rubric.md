# judging-rubric.md — 2026 NASA Space Apps Challenge Winning Checklist

NASA Space Apps judges score projects across **five equal criteria**: **Impact**, **Creativity**, **Validity**, **Relevance**, and **Presentation**. Every item below maps directly to scoring points.

---

## 1. Relevance (Does it solve the exact challenge?)
- [ ] **Coordinate Input (`RA`, `Dec`):** Accepts both decimal degrees (`133.7951, -7.2451`) and sexagesimal (`08h55m10.831s, -7d14m42.53s`).
- [ ] **Video-Like Time-Series Viewer:** Plays multi-epoch SPHEREx sky cutouts in a smooth, controllable loop (`Play/Pause`, `FPS`, `Scrubber`) so moving objects jump out visually.
- [ ] **All 5 Mandatory Targets Verified:** One-click presets work live for Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, and R Draconis.

## 2. Creativity & Bonus Considerations (High-Multiplier Features)
- [ ] **102-Band & 6-Detector-Array Controls:** Users can scrub individual bands (`1..102`, `0.75–5.0 µm`) OR toggle **Detector Array Coadds (`D1`–`D6`)** to boost signal-to-noise.
- [ ] **On-the-Fly 102-Band SED Plotter:** Clicking any source plots flux vs. wavelength (`0.75–5.0 µm`) overlaid with Methane Ice, Y-Dwarf, Comet, and Galaxy templates.
- [ ] **Image Addition & Subtraction:** Includes `Epoch N - Epoch 1` difference view (turning moving sources into black/white dipoles) and multi-frame coaddition.
- [ ] **Selectable Field of View (FOV):** User can switch FOV (`0.05°` to `0.50°`) to track fast-moving nearby objects vs. wide fields.
- [ ] **Cross-Mission Overlays (Gaia DR3 + unWISE via Aladin Lite):** Synced Aladin Lite panel overlays Gaia DR3 proper-motion vectors and 2010–2014 unWISE infrared imagery.
- [ ] **Shareable URL Query Parameters:** `?ra=&dec=&fov=&array=&band=&mode=` restores the exact investigation state on page load.
- [ ] **Contamination Flags:** Displays FITS `FLAGS` bitmask breakdown (`Clean %`, `Cosmic Ray`, `Saturated`) on every frame.

## 3. Validity (Scientific & Engineering Rigor)
- [ ] **100% Real NASA Data:** Live queries to IRSA SIA2 (`spherex_dr1` & `spherex_qr3`) + IRSA MOST cross-matching. Zero mock images.
- [ ] **WCS-Locked Alignment:** Uses `astropy.wcs` + `reproject_interp` so stationary background stars never jitter during blinking.
- [ ] **Scientific Caveats Always Visible:** Evidence panel explicitly states automated detection limits, calibration uncertainty, and MOST cross-match status.

## 4. Impact & Presentation
- [ ] **Zero-Jargon Citizen-Science Onboarding:** Guided "Spot the Mover" tour + plain-English evidence summaries alongside raw astronomical metrics (`MJD`, `SNR`, `arcsec/yr`, `parsecs`).
- [ ] **Sub-100ms Demo Latency:** Pre-warmed cache for all 5 benchmark targets so live judging demo has zero loading stalls.
- [ ] **Proper NASA Data Citations:** Footer and README cite NASA/IPAC IRSA SPHEREx DR1 & QR3 (`DOI: 10.26131/IRSA662`), Gaia DR3, and WISE/unWISE.
