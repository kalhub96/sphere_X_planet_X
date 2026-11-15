# AGENTS.md — SkyTrace Autonomous Engineering Constitution

You are building **SkyTrace** for the **2026 NASA Space Apps Challenge: Planet X and SPHEREx**.
Your mission is to deliver a working, scientifically honest, public-facing astronomical investigation platform powered by real NASA/IPAC IRSA SPHEREx data.

## 1. Source of Truth & Critical Overrides
Read `blueprint.md` and `implementation_plan.md` first, **EXCEPT** where superseded by the mandatory fixes below:

1. **IRSA SIA2 Endpoint & Collections (CRITICAL):**
   - **NEVER** use the deprecated `/ibe/sia2/spherex/qr3` endpoint.
   - **ALWAYS** query IRSA's VO SIA2 endpoint `https://irsa.ipac.caltech.edu/SIA` across **both** wide-survey collections: `COLLECTION=spherex_dr1` (released Nov 12, 2026) and `COLLECTION=spherex_qr3` (released Sep 2026). Together they provide the full multi-epoch baseline.
   - Obtain cutouts server-side by appending `?center={ra},{dec}d&size={fov_deg}` to the `access_url` returned by SIA2 (never download full 70 MB MEF files to the browser).
2. **Fix Broken DI Wiring from `implementation_plan.md`:**
   - Wire real `SQLiteCandidateRepository` and `IRSAMostAdapter` instances into `get_search_candidates_uc()` and `get_evidence_uc()` in `backend/src/infrastructure/api/dependencies.py`. Never pass `None`.
   - Store `fits_url` in SQLite `observations` table keyed by `obs.id` so `IRSAIBEAdapter.fetch(obs_id, band)` resolves `obs_id -> fits_url` cleanly.
   - Serialize real FITS WCS keywords (`CRPIX1`, `CRPIX2`, `CRVAL1`, `CRVAL2`, `CD1_1`, `CD1_2`, `CD2_1`, `CD2_2`) into `CompareResponse.wcs` so frontend `WCSTransform` projects candidate rings accurately.
3. **Challenge-Mandated Core Features (Non-Negotiable):**
   - **Multi-Epoch Video Flipbook:** Support looping through **all `N` chronological epochs** (`Epoch 1 -> 2 -> ... -> N`) like a video (play/pause, FPS slider, frame scrubber) in addition to pairwise `A vs B` Blink, Split-Slider, Subtraction (`Epoch N - Epoch 1`), and False-Color modes.
   - **Detector Array Coaddition (`D1`–`D6`):** Allow users to view single bands (`1..102`) OR median-coadded stacks per detector array (`D1`: 0.75–1.10 µm, `D2`: 1.10–1.63 µm, `D3`: 1.63–2.42 µm, `D4`: 2.42–3.58 µm, `D5`: 3.58–4.32 µm, `D6`: 4.32–5.00 µm) to boost SNR for faint brown dwarfs.
   - **Selectable Field of View (FOV):** Expose FOV presets (`0.05°`, `0.08°`, `0.15°`, `0.25°`, `0.50°`) in UI and API.
   - **URL Query State Sync:** Sync `?ra=&dec=&fov=&band=&array=&mode=` to the browser URL on every state change so any view is directly shareable/embeddable.
   - **Gaia DR3 + unWISE Overlay:** Integrate **Aladin Lite v3** (`aladin.cds.unistra.fr/AladinLite`) synced to the active `(RA, Dec, FOV)` with Gaia DR3 catalog markers and unWISE 2010–2014 infrared layer for 15-year proper-motion comparison.
   - **5 Mandatory Benchmark Presets:** Include one-click presets for **Barnard's Star**, **Epsilon Indi B**, **WISE 0855**, **RW Aurigae**, and **R Draconis** (see `benchmarks.md`).
4. **Package Correction:**
   - Install `three`, `@types/three`, and `chart.js` in `frontend/` (do **not** install `ol` / OpenLayers).

## 2. Architectural Invariants
- **Backend Hexagonal Purity:** `backend/src/domain/` MUST have **zero** imports from `fastapi`, `sqlalchemy`, `redis`, `httpx`, or `pyvo`. Only standard library, `numpy`, and `astropy` are allowed in `domain/`.
- **Strict Type Safety:** Backend must pass `uv run mypy src/` and `uv run ruff check src/`. Frontend must pass `npx tsc --noEmit`.
- **Graceful Degradation:** If Redis is unreachable in local/demo environments, fall back transparently to an in-memory TTL dict cache—never crash with `ConnectionRefusedError`.
- **Scientific Honesty:** Every candidate and evidence drawer MUST display automated-detection caveats, contamination flag breakdowns (`FLAGS` HDU), SNR, and direct IRSA archive links. Never claim a confirmed "Planet X" discovery.

## 3. Definition of Done
A feature is complete ONLY when:
1. Code is written cleanly in its proper architectural layer.
2. Unit/integration tests pass (`uv run pytest`).
3. Live verification succeeds against all 5 benchmark targets in `benchmarks.md`.

## Perpetual Conversation Memory Logging Rule

**CRITICAL MANDATORY INSTRUCTION — STRICTLY ENFORCED ACROSS ALL AGENTS AND SESSIONS**

For the Sky Trace project, you MUST maintain a perpetual conversation log of all interactions in:
`.agents/skills/Memory/memory.md`

### 1. At the Start of Every Turn (User Prompt Analysis):
- Immediately check, read, and analyze `.agents/skills/Memory/memory.md`.
- Ensure all past context, user constraints, architecture decisions, tests, and progress are preserved.

### 2. At the End of Every Turn (Turn Append):
- Every single time before you finish answering the user, you MUST append the exact conversation turn (the full user prompt and the agent's full response/actions summary) to `.agents/skills/Memory/memory.md` in the following format:

```markdown
---
### Turn [N] - [YYYY-MM-DD HH:MM:SS]
#### 👤 User Prompt:
<exact user prompt text>

#### 🤖 Agent Response:
<full agent response and summary of actions taken>
---
```

### 3. Strict Non-Forgettable Constraint:
- Never skip updating `memory.md` under any circumstances.
- If the file does not exist, create it.
- This rule takes absolute precedence across all turns in this project.
