'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  X,
  ExternalLink,
  Loader2,
  Compass,
  AlertCircle,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import BlinkViewer from '../comparison/BlinkViewer';
import { useSkyStore } from '../../store/skyStore';
import { useEpochs } from '../../hooks/useObservations';
import { formatRA, formatDec } from '../../lib/astrometry';
import { DETECTOR_ARRAYS, FOV_PRESETS, DetectorArray } from '../../config/benchmarks';
import type { Candidate } from '../../types';

interface BlinkInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BlinkInspectorModal({ isOpen, onClose }: BlinkInspectorModalProps) {
  const {
    ra,
    dec,
    fov,
    selectedBand,
    selectedArray,
    activePresetName,
    investigationMode,
    setFov,
    setSelectedBand,
    setSelectedArray,
    setInvestigationMode,
  } = useSkyStore();

  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  const epochsQuery = useEpochs(ra, dec, fov, selectedBand, selectedArray);

  if (!isOpen) return null;

  const epochFrames =
    epochsQuery.data?.epochs.map((frame) => ({
      id: `${frame.epoch_index}-${frame.epoch_mjd}`,
      label: `${frame.obs_date} · MJD ${frame.epoch_mjd.toFixed(1)}`,
      imageB64: frame.image_b64,
      epochMjd: frame.epoch_mjd,
      wcs: frame.wcs,
      flags: frame.flags,
      isSimulated: Boolean(frame.is_simulated),
    })) ?? [];

  const candidates = epochsQuery.data?.candidates ?? [];
  const displayName = activePresetName || `Patch RA ${ra.toFixed(4)}°, Dec ${dec.toFixed(4)}°`;

  const compareUrl = `/compare?ra=${ra.toFixed(6)}&dec=${dec.toFixed(6)}&fov=${fov}&band=${selectedBand}${
    selectedArray ? `&array=${selectedArray}` : ''
  }&mode=${investigationMode}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-sm border border-[var(--border-subtle)] bg-[#0a0b0fe8] shadow-[0_16px_48px_rgba(0,0,0,0.85)] text-[#F3EEE0] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[rgba(18,19,24,0.95)]">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-sm bg-[rgba(212,175,55,0.15)] text-[var(--st-gold)] border border-[rgba(212,175,55,0.3)]">
              <Layers className="w-4 h-4 text-[var(--accent-orange)]" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                  <span>{displayName}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[rgba(212,175,55,0.15)] text-[var(--st-gold)] border border-[rgba(212,175,55,0.3)]">
                    [02 Blink Viewer]
                  </span>
                </h3>
              </div>
              <p className="text-[11px] font-mono text-[var(--text-secondary)]">
                {formatRA(ra)} ({ra.toFixed(4)}°) · {formatDec(dec)} ({dec.toFixed(4)}°) · FOV {fov.toFixed(2)}°
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={compareUrl}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-sm bg-[var(--st-gold)] text-[#0a0b0f] text-xs font-semibold hover:shadow-[0_0_14px_rgba(212,175,55,0.5)] transition-all"
              title="Open full comparison studio with SED spectroscopy and Aladin Lite overlay"
            >
              <span>Full Investigation</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            <button
              onClick={onClose}
              className="p-1.5 rounded-sm text-[var(--text-secondary)] hover:text-white hover:bg-white/10 transition-colors"
              title="Close and return to 3D celestial sphere"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: Coadd and FOV fast controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-[var(--border-subtle)] bg-[rgba(10,11,15,0.9)] text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase text-[var(--text-muted)]">Coadd Array:</span>
            <button
              onClick={() => setSelectedArray(null)}
              className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-all ${
                selectedArray === null
                  ? 'bg-[var(--st-gold)] text-[#0a0b0f]'
                  : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 hover:text-white'
              }`}
            >
              Single Band {selectedBand}
            </button>
            {DETECTOR_ARRAYS.map((arr) => (
              <button
                key={arr.id}
                onClick={() => setSelectedArray(arr.id as DetectorArray)}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-all ${
                  selectedArray === arr.id
                    ? 'bg-[var(--accent-cyan)] text-[#0a0b0f] font-bold'
                    : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 hover:text-white'
                }`}
                title={`${arr.label}: ${arr.wavelengthRange}`}
              >
                {arr.id}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase text-[var(--text-muted)]">FOV:</span>
            {FOV_PRESETS.map((val) => (
              <button
                key={val}
                onClick={() => setFov(val)}
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  fov === val
                    ? 'bg-[var(--accent-cyan)] font-bold text-[#0a0b0f]'
                    : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
                }`}
              >
                {val.toFixed(2)}°
              </button>
            ))}
          </div>
        </div>

        {/* Viewer Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {epochsQuery.isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-xs font-mono text-[var(--st-gold)]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-cyan)]" />
              <span>Fetching calibrated SPHEREx survey epochs for {displayName}…</span>
            </div>
          )}

          {epochsQuery.error && (
            <div className="p-4 rounded-sm border border-[rgba(224,113,95,0.4)] bg-[rgba(224,113,95,0.08)] flex items-start gap-2.5 text-xs text-[var(--danger)] font-mono">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Archive Query Error</p>
                <p className="text-[11px] text-[var(--text-secondary)]">{(epochsQuery.error as Error).message}</p>
              </div>
            </div>
          )}

          {!epochsQuery.isLoading && !epochsQuery.error && (
            <>
              <BlinkViewer
                frames={epochFrames}
                differenceBase64={epochsQuery.data?.difference_b64}
                falseColorBase64={epochsQuery.data?.falsecolor_b64}
                candidates={candidates}
                selectedCandidateId={selectedCandidate?.id}
                onCandidateSelect={setSelectedCandidate}
                mode={investigationMode}
                onModeChange={setInvestigationMode}
              />

              {/* Informative footer bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-sm bg-white/[0.03] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)]">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--st-gold)]" />
                  <span>
                    Stepping through {epochFrames.length} survey epochs. Moving bodies shift between frames; static stars cancel out in difference mode.
                  </span>
                </span>
                <Link
                  href={compareUrl}
                  className="text-[var(--accent-cyan)] hover:underline inline-flex items-center gap-1"
                >
                  Deep Scientific Dossier & SED Spectra →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

