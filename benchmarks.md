# benchmarks.md — Mandatory 2026 Challenge Test Targets

The official NASA Space Apps Challenge brief explicitly instructs:
> *"Test your tool on Barnard’s Star, Epsilon Indi B (a pair of brown dwarfs orbiting a star), WISE 0855 (a fast-moving brown dwarf Right Ascension 08h55m10.831s, declination -7d14m42.53s), and variable stars RW Aurigae and R Draconis."*

All 5 targets MUST be pre-configured as 1-click presets in the SkyTrace UI and verified in `backend/scripts/verify_benchmarks.py`.

---

## Target Specifications & Expected Signatures

| # | Target Name | Object Class | Sexagesimal (ICRS J2000) | Decimal `RA`, `Dec` | Default `FOV` | Best Detector / Band | Expected Physical Behavior in SkyTrace |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Barnard's Star** | High-Proper-Motion Red Dwarf (`d = 1.83 pc`) | `17h 57m 48.50s`, `+04° 41' 36.2"` | `269.4521`, `+4.6934` | `0.08°` | `D1` / `D2` (`0.75–1.63 µm`) | **Fastest known proper motion** (`10.37″/yr` due north, ~1.67 SPHEREx pixels/yr). Visible positional hop between 6-month epochs and ~15″ offset from 2010 unWISE overlay. |
| **2** | **Epsilon Indi B** (`Eps Ind Ba/Bb`) | Binary T1/T6 Brown Dwarf + K5V Primary | `22h 04m 10.50s`, `-56° 46' 58.0"` | `331.0438`, `-56.7828` | `0.15°` | `D2` / `D3` (`1.10–2.42 µm`) | **Common proper motion pair** (`4.70″/yr` SE) ~6.7′ SE of bright primary Epsilon Indi A (`RA 330.8402°`). Shows methane absorption dips at `1.6 / 2.3 µm` in SED viewer. |
| **3** | **WISE 0855** (`WISE J085510.83-071442.5`) | Ultra-Cold Y-Dwarf (`~250 K`, `d = 2.28 pc`) | `08h 55m 10.831s`, `-07° 14' 42.53"` | `133.7951`, `-7.2451` | `0.08°` | **`D6` / `D5` (`3.58–5.00 µm`)** | **Fast-moving (`8.1″/yr` west) & extreme thermal IR excess.** Nearly invisible in `D1`/`D2` (`<1.6 µm`), emerges brightly in `D6` (`4.3–5.0 µm`) coadd; shifted `~1.8′` west of 2010 unWISE position. |
| **4** | **RW Aurigae** (`RW Aur A/B`) | Classical T Tauri Irregular Variable Star | `05h 07m 49.54s`, `+30° 24' 05.1"` | `76.9564`, `+30.4014` | `0.05°` | `D2` / `D4` (`1.10–3.58 µm`) | **Stationary position, dramatic brightness swings** ($\Delta m \sim 2\text{--}3\text{ mag}$) caused by circumstellar dust occultations; strong positive/negative residual in Difference mode. |
| **5** | **R Draconis** (`R Dra`) | Mira-Type Long-Period Variable (`P = 245.5 d`) | `16h 32m 39.20s`, `+66° 45' 14.0"` | `248.1633`, `+66.7539` | `0.05°` | `D3` / `D4` (`1.63–3.58 µm`) | **Stationary position, large periodic IR pulsation** across SPHEREx's 6-month (~183-day) cadence with deep $H_2O$ / $CO$ molecular bands in its 102-channel SED. |

---

## Automated Pass/Fail Criteria (`verify_benchmarks.py`)
For each of the 5 targets above:
1. `GET /api/v1/observations` returns `len(observations) >= 2` across `spherex_dr1` / `spherex_qr3`.
2. `GET /api/v1/epochs` renders at least 2 valid `512x512` PNG frames (`AsinhStretch`) in `< 10s` cold and `< 150ms` cached.
3. For **WISE 0855**, `D6` coadd SNR at target coordinates exceeds `D1` SNR (confirming genuine thermal IR detection).
4. For **RW Aurigae** and **R Draconis**, `GET /api/v1/compare` detects a high-SNR flux-change residual (`|SNR| >= 5.0`) at the star's stationary ICRS position.
