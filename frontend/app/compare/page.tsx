'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  Compass,
  Copy,
  FlaskConical,
  Layers,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
} from 'lucide-react';

import BlinkViewer from '../components/comparison/BlinkViewer';
import CombinePanel from '../components/comparison/CombinePanel';
import FalseColorPanel from '../components/comparison/FalseColorPanel';
import DiscoveryGuideModal from '../components/comparison/DiscoveryGuideModal';
import SimulatedDataBanner from '../components/comparison/SimulatedDataBanner';
import CandidateList from '../components/candidate/CandidateList';
import EvidencePanel from '../components/candidate/EvidencePanel';
import SEDChart from '../components/candidate/SEDChart';
import WavelengthSlider from '../components/sky/WavelengthSlider';
import AladinOverlay from '../components/sky/AladinOverlay';
import { BENCHMARK_PRESETS, DETECTOR_ARRAYS, FOV_MAX, FOV_MIN, FOV_PRESETS, type DetectorArray } from '../config/benchmarks';
import { formatRA, formatDec, parseCoordinateInput } from '../lib/astrometry';
import { useCombine, useComparison, useEpochs, useFalseColor } from '../hooks/useObservations';
import { useSkyQueryState } from '../hooks/useSkyQueryState';
import { useSkyStore } from '../store/skyStore';
import type { Candidate } from '../types';

function CompareViewer() {
  useSkyQueryState();
  const searchParams = useSearchParams();
  const {
    ra,
    dec,
    fov,
    selectedArray,
    selectedBand,
    investigationMode,
    activePresetName,
    simulate,
    combinePlus,
    combineMinus,
    setCoordinates,
    setFov,
    setSelectedArray,
    setSelectedBand,
    setInvestigationMode,
    setSimulate,
    setCombine,
    setCombineRole,
  } = useSkyStore();

  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [coordInput, setCoordInput] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);
  const [fovInput, setFovInput] = useState(String(Number(fov.toFixed(3))));
  const [fovError, setFovError] = useState<string | null>(null);
  const [fcRed, setFcRed] = useState<DetectorArray>('D6');
  const [fcGreen, setFcGreen] = useState<DetectorArray>('D3');
  const [fcBlue, setFcBlue] = useState<DetectorArray>('D1');
  const [fcEpoch, setFcEpoch] = useState<number | null>(null);

  useEffect(() => {
    setFovInput(String(Number(fov.toFixed(3))));
    setFovError(null);
  }, [fov]);

  const obsA = searchParams.get('obs_a');
  const obsB = searchParams.get('obs_b');
  const epochsQuery = useEpochs(ra, dec, fov, selectedBand, selectedArray, simulate);
  const pairQuery = useComparison(obsA, obsB, Math.max(0, selectedBand - 1));
  const combineQuery = useCombine(
    ra, dec, fov, selectedBand, selectedArray, combinePlus, combineMinus, simulate,
    investigationMode === 'combine'
  );
  const falseColorQuery = useFalseColor(
    ra, dec, fov, fcRed, fcGreen, fcBlue, fcEpoch, simulate,
    investigationMode === 'false_color' && new Set([fcRed, fcGreen, fcBlue]).size === 3
  );

  const comparison = pairQuery.data;
  const candidates = comparison?.candidates?.length ? comparison.candidates : (epochsQuery.data?.candidates ?? []);

  const epochFrames = epochsQuery.data?.epochs.map((frame) => ({
    id: `${frame.epoch_index}-${frame.epoch_mjd}`,
    label: `E${frame.epoch_index} · ${frame.obs_date} · MJD ${frame.epoch_mjd.toFixed(1)}`,
    imageB64: frame.image_b64,
    epochMjd: frame.epoch_mjd,
    wcs: frame.wcs,
    flags: frame.flags,
    isSimulated: Boolean(frame.is_simulated),
  })) ?? [];

  // Demo mode is the only way simulated pixels can appear; the flags double-check the response.
  const isSimulated = Boolean(simulate || epochsQuery.data?.is_simulated || comparison?.metadata?.is_simulated);

  const activeExtra = investigationMode === 'combine' ? combineQuery : investigationMode === 'false_color' ? falseColorQuery : null;
  const error = epochsQuery.error ?? pairQuery.error ?? activeExtra?.error ?? null;
  const retry = () => {
    void epochsQuery.refetch();
    if (obsA && obsB) void pairQuery.refetch();
    if (activeExtra) void activeExtra.refetch();
  };
  const warnings = epochsQuery.data?.warnings ?? [];
  const epochList = epochsQuery.data?.epochs ?? [];

  // What the viewer says when the current view has no image to draw yet.
  let viewerStatus: string | null = null;
  if (investigationMode === 'combine') {
    if (combinePlus.length === 0) viewerStatus = 'Pick epochs below: mark at least one with + to add it.';
    else if (combineQuery.isLoading) viewerStatus = 'Computing from the archive pixels…';
    else if (combineQuery.error) viewerStatus = 'This combination could not be built (see the message above).';
  } else if (investigationMode === 'false_color') {
    if (new Set([fcRed, fcGreen, fcBlue]).size < 3) viewerStatus = 'Pick three different detector arrays below.';
    else if (falseColorQuery.isLoading) viewerStatus = 'Downloading and stacking three bands…';
    else if (falseColorQuery.error) viewerStatus = 'The composite could not be built (see the message above).';
  } else if (epochsQuery.error) {
    viewerStatus = 'No images to show (see the message above).';
  }

  const commitFov = () => {
    const parsed = Number(fovInput);
    if (!Number.isFinite(parsed) || parsed < FOV_MIN || parsed > FOV_MAX) {
      setFovError(`Enter a field of view between ${FOV_MIN} and ${FOV_MAX} degrees.`);
      return;
    }
    setFovError(null);
    setFov(Number(parsed.toFixed(3)));
  };

  const handleShareUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleSlewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCoordError(null);
    if (!coordInput.trim()) return;

    const parsed = parseCoordinateInput(coordInput);
    if (parsed) {
      setCoordinates(parsed.ra, parsed.dec, 'Custom Coordinates');
      setCoordInput('');
    } else {
      setCoordError('Invalid coordinates. Use decimal (133.79, -7.24) or sexagesimal (08h55m10s, -7d14m42s).');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-[#F3EEE0]">
      {/* 1. Header */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[#0a0b0fe8] px-4 py-3 backdrop-blur-md md:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <div className="hidden h-4 w-px bg-[var(--border-subtle)] sm:block" />
          <h1 className="st-serif flex items-center gap-2 text-2xl font-normal leading-none">
            <Layers className="h-5 w-5 text-[var(--accent-orange)]" /> SkyTrace Multi-Epoch Investigation
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuide(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[rgba(212,175,55,0.3)] bg-[rgba(212,175,55,0.1)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-cyan)] transition-colors hover:bg-[rgba(212,175,55,0.2)]"
            title="Open Citizen Science discovery tutorial"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Discovery Guide</span>
          </button>

          <button
            onClick={handleShareUrl}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.1)]"
            title="Copy shareable URL with exact celestial coordinates, band, and mode"
          >
            {copiedUrl ? <Check className="h-3.5 w-3.5 text-[var(--accent-green)]" /> : <Share2 className="h-3.5 w-3.5 text-[var(--accent-cyan)]" />}
            <span>{copiedUrl ? 'Copied' : 'Share URL'}</span>
          </button>

          <div className="hidden items-center gap-2 rounded border border-[rgba(212,175,55,0.25)] bg-[rgba(212,175,55,0.08)] px-2.5 py-1 text-[11px] font-mono sm:flex">
            <Radio className="h-3.5 w-3.5 animate-pulse text-[var(--accent-cyan)]" />
            NASA SPHEREx DR1 + QR3
          </div>
        </div>
      </header>

      {/* 2. Challenge Benchmark Presets Selector Bar */}
      <section className="border-b border-[var(--border-subtle)] bg-[rgba(18,19,24,0.8)] px-4 py-2.5 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-[var(--accent-gold)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent-orange)]" />
              Target Presets:
            </span>
            {BENCHMARK_PRESETS.map((preset) => {
              const isActive = activePresetName === preset.name || (Math.abs(ra - preset.ra) < 0.01 && Math.abs(dec - preset.dec) < 0.01);
              return (
                <button
                  key={preset.name}
                  onClick={() => {
                    setCoordinates(preset.ra, preset.dec, preset.name);
                    setFov(preset.fov);
                    setSelectedArray(preset.array);
                    setSelectedBand(preset.band);
                  }}
                  className={`rounded-sm px-2.5 py-1 text-xs font-semibold transition-all ${
                    isActive
                      ? 'border border-[var(--accent-cyan)] bg-[rgba(212,175,55,0.18)] text-[var(--accent-cyan)] shadow-[0_0_10px_rgba(212,175,55,0.2)]'
                      : 'border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.1)] hover:text-white'
                  }`}
                  title={`${preset.name} (${preset.description})`}
                >
                  {preset.name}
                  <span className="ml-1.5 text-[10px] font-mono opacity-70">[{preset.array}]</span>
                </button>
              );
            })}
          </div>

          {/* Detector Array & FOV Fast Controls */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--text-muted)]">FOV:</span>
              {FOV_PRESETS.map((val) => (
                <button
                  key={val}
                  onClick={() => setFov(val)}
                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                    fov === val ? 'bg-[var(--accent-cyan)] font-bold text-[#0a0b0f]' : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
                  }`}
                >
                  {val.toFixed(2)}°
                </button>
              ))}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  commitFov();
                }}
                className="ml-1 flex items-center gap-1"
              >
                <input
                  type="number"
                  inputMode="decimal"
                  min={FOV_MIN}
                  max={FOV_MAX}
                  step="0.01"
                  value={fovInput}
                  onChange={(event) => setFovInput(event.target.value)}
                  onBlur={commitFov}
                  aria-label="Field of view in degrees"
                  title={`Any field of view from ${FOV_MIN}° to ${FOV_MAX}°. Larger fields track faster movers but take longer to download.`}
                  className="w-16 rounded border border-[var(--border-subtle)] bg-[rgba(6,8,16,0.85)] px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-[var(--accent-cyan)]"
                />
                <span className="text-[10px] text-[var(--text-muted)]">°</span>
              </form>
              {fovError && <span className="text-[10px] text-[var(--danger)]">{fovError}</span>}
            </div>

            <label
              className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] ${
                simulate
                  ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                  : 'border-[var(--border-subtle)] bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
              }`}
              title="Explore the interface with a scripted, simulated sky. Off by default: SkyTrace shows real SPHEREx data."
            >
              <input
                type="checkbox"
                checked={simulate}
                onChange={(event) => setSimulate(event.target.checked)}
                className="accent-amber-400"
                data-testid="demo-mode-toggle"
              />
              <FlaskConical className="h-3 w-3" /> Demo mode
            </label>

            <div className="flex items-center gap-1 border-l border-[var(--border-subtle)] pl-3">
              <span className="text-[10px] text-[var(--text-muted)]">Coadd:</span>
              <button
                onClick={() => setSelectedArray(null)}
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  selectedArray === null ? 'bg-[var(--accent-gold)] font-bold text-[#0a0b0f]' : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
                }`}
              >
                Single
              </button>
              {DETECTOR_ARRAYS.map((arr) => (
                <button
                  key={arr.id}
                  onClick={() => setSelectedArray(arr.id as DetectorArray)}
                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                    selectedArray === arr.id ? 'bg-[var(--accent-cyan)] font-bold text-[#0a0b0f]' : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
                  }`}
                  title={`${arr.label}: ${arr.wavelengthRange} (Bands ${arr.bandRange})`}
                >
                  {arr.id}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Main Workspace */}
      <main className="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-12 lg:p-6">
        <div className="space-y-5 lg:col-span-8">
          {(epochsQuery.isLoading || pairQuery.isLoading) && (
            <div className="flex items-center gap-2 rounded border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.07)] px-3 py-2 text-xs font-mono text-[var(--accent-cyan)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {simulate
                ? 'Generating the demo sky…'
                : 'Asking the SPHEREx archive (IRSA) and downloading real cutouts. This can take up to a minute…'}
            </div>
          )}
          {error && (
            <div className="flex flex-wrap items-start gap-2 rounded border border-[rgba(224,113,95,0.4)] bg-[rgba(224,113,95,0.08)] p-3 text-xs text-[var(--text-secondary)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
              <div className="min-w-0 flex-1 space-y-1">
                <p>{(error as Error).message}</p>
                {!simulate && (
                  <p className="text-[10px] text-[var(--text-muted)]">
                    SkyTrace only shows real SPHEREx data. To explore the interface while the archive is unavailable,
                    switch on <strong>Demo mode</strong> above.
                  </p>
                )}
              </div>
              <button
                onClick={retry}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--border-subtle)] bg-white/5 px-2 py-1 font-semibold text-white hover:bg-white/10"
              >
                <RefreshCw className="h-3 w-3" /> Try again
              </button>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded border border-[rgba(255,209,102,0.35)] bg-[rgba(255,209,102,0.07)] p-3 text-[11px] text-[var(--text-secondary)]" data-testid="epoch-warnings">
              <p className="mb-1 font-semibold text-[var(--accent-gold)]">Some epochs could not be loaded</p>
              <ul className="space-y-0.5">
                {warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">The frames shown are real archive data; the missing epochs are simply left out.</p>
            </div>
          )}

          <SimulatedDataBanner isSimulated={isSimulated} onExit={simulate ? () => setSimulate(false) : undefined} />

          <BlinkViewer
            frames={epochFrames}
            imageABase64={comparison?.image_a_b64}
            imageBBase64={comparison?.image_b_b64}
            differenceBase64={comparison?.difference_b64 ?? epochsQuery.data?.difference_b64}
            falseColorBase64={falseColorQuery.data?.image_b64 ?? null}
            combineBase64={combineQuery.data?.image_b64 ?? null}
            falseColorCaption={
              falseColorQuery.data
                ? `R ${fcRed} · G ${fcGreen} · B ${fcBlue} · epoch ${falseColorQuery.data.epoch_index} · ${falseColorQuery.data.obs_date}`
                : null
            }
            combineCaption={combineQuery.data?.label ?? null}
            statusMessage={viewerStatus}
            simulatedOverlay={
              investigationMode === 'combine'
                ? Boolean(combineQuery.data?.is_simulated)
                : investigationMode === 'false_color'
                  ? Boolean(falseColorQuery.data?.is_simulated)
                  : false
            }
            candidates={investigationMode === 'combine' || investigationMode === 'false_color' ? [] : candidates}
            selectedCandidateId={selectedCandidate?.id}
            onCandidateSelect={(candidate) => setSelectedCandidate(candidate)}
            mode={investigationMode}
            onModeChange={setInvestigationMode}
          />

          {investigationMode === 'combine' && (
            <CombinePanel
              epochs={epochList}
              plus={combinePlus}
              minus={combineMinus}
              onRole={setCombineRole}
              onClear={() => setCombine([], [])}
              loading={combineQuery.isLoading}
              resultLabel={combineQuery.data?.label}
              resultKind={combineQuery.data?.kind}
            />
          )}
          {investigationMode === 'false_color' && (
            <FalseColorPanel
              red={fcRed}
              green={fcGreen}
              blue={fcBlue}
              epoch={fcEpoch}
              epochCount={epochList.length > 0 ? Math.max(...epochList.map((frame) => frame.epoch_index)) : 0}
              onChange={(next) => {
                if (next.red) setFcRed(next.red);
                if (next.green) setFcGreen(next.green);
                if (next.blue) setFcBlue(next.blue);
                if (next.epoch !== undefined) setFcEpoch(next.epoch);
              }}
              channels={falseColorQuery.data?.channels}
              loading={falseColorQuery.isLoading}
            />
          )}

          <WavelengthSlider />

          <SEDChart
            candidateId={selectedCandidate?.id}
            ra={selectedCandidate?.ra_deg ?? ra}
            dec={selectedCandidate?.dec_deg ?? dec}
            simulate={isSimulated}
          />

          <AladinOverlay ra={ra} dec={dec} fov={fov} />
        </div>

        {/* 4. Side Panel: Candidates & Scientific Metadata */}
        <aside className="space-y-4 lg:col-span-4">
          <div className="glass-panel border border-[var(--border-subtle)] p-3.5 text-xs font-mono">
            <div className="mb-2 flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[var(--accent-cyan)]">
                <Compass className="h-3.5 w-3.5" /> Region Telemetry
              </span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white">
                FOV {Number(fov.toFixed(3))}°
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-[var(--text-muted)]">RA (ICRS):</span>
                <div className="font-semibold text-[var(--text-primary)]">{ra.toFixed(5)}°</div>
                <div className="text-[10px] text-[var(--accent-cyan)]">{formatRA(ra)}</div>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Dec (ICRS):</span>
                <div className="font-semibold text-[var(--text-primary)]">{dec.toFixed(5)}°</div>
                <div className="text-[10px] text-[var(--accent-cyan)]">{formatDec(dec)}</div>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">SPHEREx Mode:</span>
                <div className="font-semibold text-[var(--accent-gold)]">{selectedArray ? `${selectedArray} Coadd` : `Band ${selectedBand}`}</div>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Survey Passes:</span>
                <div className="font-semibold text-[var(--accent-green)]">{epochFrames.length} Epochs</div>
              </div>
            </div>

            {/* Manual Slew Input */}
            <div className="mt-3 border-t border-[var(--border-subtle)] pt-2.5">
              <form onSubmit={handleSlewSubmit} className="flex gap-1.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={coordInput}
                    onChange={(e) => setCoordInput(e.target.value)}
                    placeholder="Enter coords (e.g. 08h55m10s, -7d14m42s)"
                    className="w-full rounded bg-[rgba(10,11,15,0.85)] border border-[var(--border-subtle)] pl-2 pr-2 py-1 text-[11px] font-mono text-white placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)] outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded bg-[var(--accent-cyan)] px-3 py-1 text-[11px] font-bold text-[#0a0b0f] hover:bg-[#00c8e0] transition-colors"
                >
                  Slew
                </button>
              </form>
              {coordError && (
                <p className="mt-1 text-[10px] text-[var(--danger)]">{coordError}</p>
              )}
            </div>
          </div>

          {candidates.length > 0 ? (
            <CandidateList
              candidates={candidates}
              selectedId={selectedCandidate?.id}
              onSelect={setSelectedCandidate}
            />
          ) : (
            <section className="glass-panel border border-[var(--border-subtle)] p-4 text-xs text-[var(--text-secondary)]">
              <h2 className="mb-2 font-semibold text-[var(--text-primary)]">Detection Queue</h2>
              <p className="leading-relaxed">
                Difference map source detection active across Epochs. As soon as a moving or variable source exceeds the SNR threshold in the difference view, it will be automatically reticled on the canvas.
              </p>
            </section>
          )}

          <section className="glass-panel border border-[var(--border-subtle)] p-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
              Scientific Verification Protocol
            </h2>
            <ul className="space-y-1.5 text-[10px]">
              <li>• <strong>Moving Targets:</strong> Check flipbook video loop for consistent proper motion across all epochs.</li>
              <li>• <strong>Brown Dwarfs:</strong> Compare thermal IR flux in D5/D6 coadds versus optical/near-IR D1.</li>
              <li>• <strong>Solar System:</strong> Automated cross-matching checks NASA/IPAC MOST for known asteroids/comets.</li>
            </ul>
          </section>
        </aside>
      </main>

      {/* Discovery Guide Modal */}
      <DiscoveryGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        onSelectPreset={(preset) => {
          setCoordinates(preset.ra, preset.dec, preset.name);
          setFov(preset.fov);
          setSelectedArray(preset.array);
          setSelectedBand(preset.band);
        }}
      />

      {selectedCandidate && (
        <EvidencePanel
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
        />
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0b0f]" />}>
      <CompareViewer />
    </Suspense>
  );
}
