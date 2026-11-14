# skills.md — Specialized Astronomical & Full-Stack Skills for SkyTrace

Load and apply these exact technical patterns when implementing SkyTrace modules.

---

## Skill 1: `irsa-spherex-sia2-pipeline`
**Purpose:** Query NASA/IPAC IRSA for SPHEREx DR1 and QR3 Multi-Extension FITS (MEF) exposures and fetch fast server-side spatial cutouts.

- **SIA2 Base URL:** `https://irsa.ipac.caltech.edu/SIA`
- **Collections to Query Concurrently:** `spherex_dr1` and `spherex_qr3` (wide all-sky survey; optionally `spherex_dr1_deep` / `spherex_qr3_deep` if wide returns `< 2` epochs).
- **Query Parameters:**
  - `COLLECTION`: `spherex_dr1` or `spherex_qr3`
  - `POS`: `circle {ra_deg} {dec_deg} {radius_deg}`
  - `RESPONSEFORMAT`: `JSON`
- **Cutout Fetch Rule:**
  - Never download full 2040×2040 MEFs (~70 MB). Append `?center={ra_deg},{dec_deg}d&size={fov_deg}` to the SIA2 `access_url`.
  - Retry transient HTTP 502/503/504 errors up to 3 times with exponential backoff (`0.5s, 1.0s, 2.0s`).
- **MEF HDU Structure (Astropy):**
  - `hdul[0]` (`PRIMARY`): `MJD-OBS`, `DATE-OBS`, `BAND` / `DETECTOR` (`D1`..`D6`)
  - `hdul["IMAGE"]`: 2D `float32` calibrated surface brightness (`MJy/sr`)
  - `hdul["FLAGS"]`: 2D `int16` bitmask (0 = clean; non-zero = cosmic ray, saturated, bad pixel, transient)
  - `hdul["VARIANCE"]`: 2D `float32` pixel variance ($\sigma^2$)
  - `hdul["ZODI"]`: Zodiacal light background model
  - `hdul["WCS-WAVE"]`: Spectral lookup table for `WCS(header=hdul["IMAGE"].header, fobj=hdul, key="W")`

---

## Skill 2: `lvf-wavelength-and-detector-coadd`
**Purpose:** Compute exact SPHEREx Linear Variable Filter (LVF) wavelengths and stack detector arrays (`D1`–`D6`) to improve SNR.

- **102-Band Logarithmic Formula (1-indexed $i \in [1, 102]$):**
  $$\lambda_i = 0.75 \times \left(\frac{5.0}{0.75}\right)^{\frac{i - 1}{101}} \;\mu\text{m}$$
- **6 HgCdTe Detector Array Mapping:**
  - `D1`: Bands `1–17` (`0.75 – 1.10 µm`) — Stellar photospheres
  - `D2`: Bands `18–34` (`1.10 – 1.63 µm`) — $H_2O$ / $CH_4$ bands
  - `D3`: Bands `35–51` (`1.63 – 2.42 µm`) — $CH_4$ ice absorption (`2.3 µm`)
  - `D4`: Bands `52–68` (`2.42 – 3.58 µm`) — $H_2O$ ice (`3.0 µm`) & $CH_4$ (`3.3–3.4 µm`)
  - `D5`: Bands `69–85` (`3.58 – 4.32 µm`) — $CO_2$ (`4.26 µm`) & thermal onset
  - `D6`: Bands `86–102` (`4.32 – 5.00 µm`) — $CO$ (`4.67 µm`) & ultra-cold Y-dwarfs (WISE 0855)
- **Epoch Grouping & Coaddition Algorithm:**
  1. Cluster observations by `MJD-OBS` into ~6-month sky-pass epochs (observations within $\Delta \text{MJD} \le 15\text{ days}$ belong to the same epoch pass).
  2. Reproject all frames in `(epoch, detector_array)` onto the earliest epoch's reference `WCS` via `reproject_interp`.
  3. Mask pixels where `FLAGS != 0` as `np.nan` and compute `np.nanmedian(stack, axis=0)` for high-SNR epoch frames.

---

## Skill 3: `wcs-astrometry-and-parallax`
**Purpose:** Convert sky coordinates `(RA, Dec)` to pixel coordinates and 3D unit vectors, and derive physical distance from parallax shifts.

- **ICRS Unit Vector (Three.js Celestial Sphere):**
  $$\hat{u} = (\cos\delta\cos\alpha,\; \cos\delta\sin\alpha,\; \sin\delta)$$
- **SPHEREx Nominal Pixel Scale:** $6.2\text{ arcsec/pixel}$.
- **Parallax Distance Formula (6-month baseline):**
  $$\Delta\theta_{\text{arcsec}} = \Delta p_{\text{px}} \times 6.2, \quad \pi_{\text{arcsec}} = \frac{\Delta\theta_{\text{arcsec}}}{2}, \quad d_{\text{pc}} = \frac{1}{\pi_{\text{arcsec}}}, \quad d_{\text{AU}} = d_{\text{pc}} \times 206265$$
- **Proper Motion Rate:**
  $$\mu_{\text{arcsec/yr}} = \frac{\Delta\theta_{\text{arcsec}}}{\Delta t_{\text{years}}}$$

---

## Skill 4: `wiseview-asinh-and-blink-canvas`
**Purpose:** Render high-dynamic-range infrared astronomical cutouts so faint moving dots stand out next to bright stars.

- **Asinh Stretch Normalization (`astropy.visualization`):**
  - Use `AsinhStretch(a=0.1) + PercentileInterval(99.5)` (default "WiseView mode") alongside `ZScaleInterval`, `LogStretch`, and `LinearStretch`.
- **HTML5 Canvas Multi-Epoch Flipbook (`BlinkViewer.tsx`):**
  - Preload all `N` epoch PNG frames (`Image[]`) into memory before starting `requestAnimationFrame` / timer loop so frame switching takes `< 16ms` with zero flicker.
  - Render HUD overlay directly on canvas: `EPOCH k / N`, `DATE-OBS (MJD)`, `DETECTOR / BAND (µm)`, `FOV`, and WCS-projected candidate reticle rings (`sky2pix`).
  - Support keyboard controls: `Space` (Play/Pause), `ArrowLeft` / `ArrowRight` (Step epoch -1 / +1), `D` (Toggle Difference mode), `I` (Invert grayscale).

---

## Skill 5: `aladin-lite-external-overlays`
**Purpose:** Provide cross-mission verification against **Gaia DR3** and **WISE / unWISE** as recommended in the challenge brief.

- Load Aladin Lite v3 (`https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js`) in a synchronized split-view or toggle tab.
- Initialize with `target: "${ra} ${dec}"`, `fov: ${fovDeg}`, `survey: "P/unWISE/color-W2-W1W2-W1"` (2010–2014 infrared baseline) and overlay the **Gaia DR3** catalog (`CDS/I/355/gaiadr3`) with proper-motion vectors enabled.
- Display the exact time baseline badge: `unWISE (2010–2014) vs. SPHEREx (2025–2026) = ~15-Year Baseline`.
