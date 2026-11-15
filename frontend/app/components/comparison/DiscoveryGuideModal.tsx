'use client';

import React from 'react';
import {
  X,
  Play,
  Layers,
  Sparkles,
  Sliders,
  Compass,
  Telescope,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { BENCHMARK_PRESETS, DetectorArray } from '../../config/benchmarks';

interface DiscoveryGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: (typeof BENCHMARK_PRESETS)[0]) => void;
}

export default function DiscoveryGuideModal({
  isOpen,
  onClose,
  onSelectPreset,
}: DiscoveryGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-sm border border-[var(--border-subtle)] bg-[#121318] p-6 text-[var(--text-primary)] shadow-2xl shadow-cyan-950/40">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[rgba(212,175,55,0.15)] text-[var(--accent-cyan)]">
              <Telescope className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Citizen Science Guide: Spotting Movers & Variables in SPHEREx
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                NASA Space Apps 2026 · Planet X & SPHEREx Multi-Epoch Workflow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm p-1 text-[var(--text-muted)] hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 4 Pillars Grid */}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {/* Technique 1 */}
          <div className="rounded-sm border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.04)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-cyan)]">
              <Play className="h-4 w-4" />
              <span>1. Multi-Epoch Flipbook Motion</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              SPHEREx surveys the entire sky every 6 months. In <strong>Flipbook</strong> mode, press <kbd className="rounded bg-white/10 px-1 py-0.5 text-[10px] font-mono text-white">Space</kbd> or the Play button to loop through passes. Watch for points of light that jump or drift linearly against the stationary background stars.
            </p>
            <div className="mt-2 text-[11px] font-mono text-[var(--accent-gold)]">
              Pro tip: Adjust the FPS slider down to 1.5× to spot subtle displacements.
            </div>
          </div>

          {/* Technique 2 */}
          <div className="rounded-sm border border-[rgba(230,198,92,0.25)] bg-[rgba(230,198,92,0.04)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-gold)]">
              <Layers className="h-4 w-4" />
              <span>2. Detector Array Coadding (D1–D6)</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Each detector array covers 17 spectral bands. Cold sub-stellar objects (like brown dwarf <strong>WISE 0855</strong> at 250 K) emit very little optical/near-IR light, but shine in <strong>D6</strong> (4.4–5.0 µm). Coadding 17 bands boosts signal-to-noise by <span className="font-mono text-white">~4.1× (√17)</span>.
            </p>
            <div className="mt-2 text-[11px] font-mono text-[var(--accent-cyan)]">
              Pro tip: Switch from Single Band to D6 Coadd to reveal faint thermal sources.
            </div>
          </div>

          {/* Technique 3 */}
          <div className="rounded-sm border border-[rgba(224,113,95,0.25)] bg-[rgba(224,113,95,0.04)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-pink)]">
              <Sliders className="h-4 w-4" />
              <span>3. Difference Dipoles (Epoch N − 1)</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Image subtraction cancels out stationary stars and galaxies. A moving object creates a characteristic <strong>black/white dipole</strong> (dark negative crater at Epoch 1, bright white peak at Epoch N). Variable stars (RW Aur, R Dra) show a stationary pulsing brightness monopole.
            </p>
            <div className="mt-2 text-[11px] font-mono text-[var(--accent-green)]">
              Pro tip: Automated reticle rings highlight difference sources with high ΔSNR.
            </div>
          </div>

          {/* Technique 4 */}
          <div className="rounded-sm border border-[rgba(143,188,143,0.25)] bg-[rgba(143,188,143,0.04)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-green)]">
              <Compass className="h-4 w-4" />
              <span>4. 15-Year Multi-Mission Baseline</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Scroll down to the <strong>Aladin Lite v3</strong> reference panel. Compare 2025–2026 SPHEREx imagery with the 2010–2014 unWISE mid-infrared survey. A 15-year baseline confirms true proper motion and rules out transient detector artifacts or cosmic rays.
            </p>
            <div className="mt-2 text-[11px] font-mono text-[var(--accent-cyan)]">
              Pro tip: Gaia DR3 vectors provide astrometric verification for stellar fields.
            </div>
          </div>
        </div>

        {/* 5 Challenge Target Quick-Launch Presets */}
        <div className="mt-6 border-t border-[var(--border-subtle)] pt-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />
            <span>Try the 5 Official NASA Challenge Targets:</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {BENCHMARK_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => {
                  onSelectPreset(preset);
                  onClose();
                }}
                className="flex flex-col items-start rounded-sm border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-2.5 text-left transition-all hover:border-[var(--accent-cyan)] hover:bg-[rgba(212,175,55,0.08)]"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-bold text-white">{preset.name}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-[var(--accent-cyan)]">
                    {preset.array}
                  </span>
                </div>
                <span className="mt-1 text-[11px] text-[var(--text-muted)] line-clamp-2">
                  {preset.description}
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-[var(--accent-gold)]">
                  Load Target <ExternalLink className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-[var(--accent-green)]" />
            <span>IRSA SIA2 VO Service Active · Real SPHEREx DR1 + QR3 Data</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm bg-[var(--accent-cyan)] px-4 py-1.5 text-xs font-bold text-[#0a0b0f] hover:bg-[#00c8e0]"
          >
            Start Investigating
          </button>
        </div>
      </div>
    </div>
  );
}
