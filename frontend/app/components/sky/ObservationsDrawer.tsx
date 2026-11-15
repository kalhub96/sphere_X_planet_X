'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Layers, Loader2, AlertCircle, Calendar, Sparkles, ArrowRight } from 'lucide-react';
import { useSkyStore } from '../../store/skyStore';
import { useObservations } from '../../hooks/useObservations';

export default function ObservationsDrawer() {
  const {
    ra,
    dec,
    fov,
    selectedBand,
    selectedObsA,
    selectedObsB,
    selectObsA,
    selectObsB,
  } = useSkyStore();

  const { data: observations, isLoading, error } = useObservations(
    ra,
    dec,
    fov,
    selectedBand
  );

  // Clear selections that no longer exist in the current result set
  useEffect(() => {
    if (!observations) return;
    const ids = new Set(observations.map((o) => o.id));
    if (selectedObsA && !ids.has(selectedObsA.id)) selectObsA(null);
    if (selectedObsB && !ids.has(selectedObsB.id)) selectObsB(null);
  }, [observations, selectedObsA, selectedObsB, selectObsA, selectObsB]);

  const handleSelectA = (obs: NonNullable<typeof observations>[number], isSelectedA: boolean) => {
    if (isSelectedA) {
      selectObsA(null);
      return;
    }
    // Prevent the same epoch being both A and B
    if (selectedObsB?.id === obs.id) selectObsB(null);
    selectObsA(obs);
  };

  const handleSelectB = (obs: NonNullable<typeof observations>[number], isSelectedB: boolean) => {
    if (isSelectedB) {
      selectObsB(null);
      return;
    }
    if (selectedObsA?.id === obs.id) selectObsA(null);
    selectObsB(obs);
  };

  const bothSelected = Boolean(selectedObsA && selectedObsB);

  return (
    <div className="glass-panel p-4 backdrop-blur-md">
      <div className="flex items-center justify-between mb-3 border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--accent-green)]" />
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--text-secondary)]">
            Multi-Epoch Sky Passes
          </span>
        </div>
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          Field Coverage: r = {Number.isFinite(fov) ? fov.toFixed(1) : '—'}°
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--text-secondary)] font-mono">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-cyan)]" />
          Querying NASA IRSA SPHEREx QR3 Archives...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 py-4 px-3 rounded bg-[rgba(224,113,95,0.1)] border border-[var(--danger)] text-xs text-[var(--danger)] font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Archive query error: {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {observations && observations.length === 0 && !isLoading && (
        <div className="text-center py-6 text-xs text-[var(--text-secondary)] font-mono">
          No SPHEREx survey tiles cataloged for this exact pointing. Try selecting a Calibration target above.
        </div>
      )}

      {observations && observations.length > 0 && (
        <div className="space-y-3">
          <div className="text-[11px] text-[var(--text-secondary)] font-mono flex items-center justify-between">
            <span>{observations.length} Epoch Passes Cataloged</span>
            <span className="text-[var(--accent-cyan)]">Select 2 epochs for Differential Photometry</span>
          </div>

          {/* Observations Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {observations.map((obs) => {
              const isSelectedA = selectedObsA?.id === obs.id;
              const isSelectedB = selectedObsB?.id === obs.id;

              return (
                <div
                  key={obs.id}
                  className={`p-2.5 rounded-sm border transition-all text-xs font-mono ${
                    isSelectedA
                      ? 'bg-[rgba(212,175,55,0.15)] border-[var(--accent-cyan)] shadow-[0_0_12px_rgba(212,175,55,0.2)]'
                      : isSelectedB
                      ? 'bg-[rgba(200,121,58,0.15)] border-[var(--accent-orange)] shadow-[0_0_12px_rgba(200,121,58,0.2)]'
                      : 'bg-[rgba(0,0,0,0.3)] border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold mb-1">
                    <span className="text-[var(--text-primary)] truncate max-w-[140px]" title={obs.id}>
                      {obs.id}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[var(--accent-gold)]">
                      {typeof obs.quality_pct === 'number' ? obs.quality_pct.toFixed(0) : '—'}% Q
                    </span>
                  </div>

                  <div className="text-[11px] text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-[var(--text-muted)]" />
                    <span>{obs.obs_date}</span>
                    <span className="text-[var(--text-muted)]">|</span>
                    <span>
                      {((obs as any).exposure_s ?? (obs as any).exposure_time ?? '—')}
                      s
                    </span>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      aria-pressed={isSelectedA}
                      onClick={() => handleSelectA(obs, isSelectedA)}
                      className={`flex-1 py-1 rounded text-[10px] font-semibold transition-all ${
                        isSelectedA
                          ? 'bg-[var(--accent-cyan)] text-[#0a0b0f]'
                          : 'bg-[rgba(212,175,55,0.1)] text-[var(--accent-cyan)] hover:bg-[rgba(212,175,55,0.2)]'
                      }`}
                    >
                      {isSelectedA ? '✓ Epoch A' : 'Set as Epoch A'}
                    </button>
                    <button
                      type="button"
                      aria-pressed={isSelectedB}
                      onClick={() => handleSelectB(obs, isSelectedB)}
                      className={`flex-1 py-1 rounded text-[10px] font-semibold transition-all ${
                        isSelectedB
                          ? 'bg-[var(--accent-orange)] text-[#0a0b0f]'
                          : 'bg-[rgba(200,121,58,0.1)] text-[var(--accent-orange)] hover:bg-[rgba(200,121,58,0.2)]'
                      }`}
                    >
                      {isSelectedB ? '✓ Epoch B' : 'Set as Epoch B'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Launch Comparison CTA */}
          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <div className="text-[11px] font-mono text-[var(--text-secondary)]">
              {bothSelected ? (
                <span className="text-[var(--accent-green)] flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Epochs aligned & ready for diffing
                </span>
              ) : (
                <span className="text-[var(--text-muted)]">
                  Pick Epoch A & Epoch B to run difference imaging
                </span>
              )}
            </div>

            {selectedObsA && selectedObsB ? (
              <Link
                href={`/compare?obs_a=${encodeURIComponent(selectedObsA.id)}&obs_b=${encodeURIComponent(
                  selectedObsB.id
                )}&band=${encodeURIComponent(String(selectedBand))}`}
                className="bg-[var(--accent-cyan)] hover:shadow-[0_0_16px_rgba(212,175,55,0.5)] text-[#0a0b0f] px-4 py-2 rounded-sm text-xs font-bold transition-all flex items-center gap-1.5"
              >
                Launch Blink Comparator <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="bg-[rgba(255,255,255,0.05)] text-[var(--text-muted)] px-4 py-2 rounded-sm text-xs font-medium cursor-not-allowed flex items-center gap-1.5"
              >
                Select 2 Epochs <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}