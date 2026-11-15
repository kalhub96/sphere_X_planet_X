'use client';

import { DETECTOR_ARRAYS, type DetectorArray } from '../../config/benchmarks';
import type { FalseColorChannel } from '../../types';

interface FalseColorPanelProps {
  red: DetectorArray;
  green: DetectorArray;
  blue: DetectorArray;
  epoch: number | null;
  epochCount: number;
  onChange: (next: { red?: DetectorArray; green?: DetectorArray; blue?: DetectorArray; epoch?: number | null }) => void;
  channels?: FalseColorChannel[];
  loading: boolean;
}

const COLOURS = [
  { key: 'red' as const, label: 'Red', swatch: '#ff5a5f' },
  { key: 'green' as const, label: 'Green', swatch: '#3ddc84' },
  { key: 'blue' as const, label: 'Blue', swatch: '#4da3ff' },
];

/**
 * Real three-band composite: each colour is a stack of SPHEREx exposures from one detector
 * array (one wavelength range) of the same survey epoch. Colour therefore means wavelength.
 */
export default function FalseColorPanel({
  red,
  green,
  blue,
  epoch,
  epochCount,
  onChange,
  channels,
  loading,
}: FalseColorPanelProps) {
  const values = { red, green, blue };
  const select = 'rounded border border-[var(--border-subtle)] bg-[rgba(6,8,16,0.85)] px-1.5 py-1 text-[11px] font-mono text-white';

  return (
    <section className="glass-panel space-y-3 border border-[var(--border-subtle)] p-4 text-xs" data-testid="falsecolor-panel">
      <h2 className="font-semibold uppercase tracking-wide text-[var(--accent-cyan)]">Three-band false colour</h2>
      <p className="leading-relaxed text-[var(--text-secondary)]">
        Each colour is a real stack of SPHEREx exposures from one detector array, so colour means wavelength: very red
        objects are brightest at long infrared wavelengths (cold brown dwarfs, dusty sources), blue ones at short.
      </p>

      <div className="grid gap-2 sm:grid-cols-4">
        {COLOURS.map(({ key, label, swatch }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] uppercase text-[var(--text-muted)]">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: swatch }} /> {label}
            </span>
            <select
              className={select}
              value={values[key]}
              onChange={(event) => onChange({ [key]: event.target.value as DetectorArray })}
            >
              {DETECTOR_ARRAYS.map((array) => (
                <option key={array.id} value={array.id}>
                  {array.id} · {array.wavelengthRange}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase text-[var(--text-muted)]">Epoch</span>
          <select
            className={select}
            value={epoch ?? ''}
            onChange={(event) => onChange({ epoch: event.target.value === '' ? null : Number(event.target.value) })}
          >
            <option value="">Latest</option>
            {Array.from({ length: epochCount }, (_, index) => index + 1).map((n) => (
              <option key={n} value={n}>
                Epoch {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {new Set([red, green, blue]).size < 3 && (
        <p className="text-[var(--danger)]">Pick three different detector arrays.</p>
      )}
      <p className="font-mono text-[11px] text-[var(--text-secondary)]">
        {loading
          ? 'Downloading and stacking the three bands…'
          : channels && channels.length === 3
            ? channels
                .map((c) => `${c.channel[0].toUpperCase()}: ${c.array} ${c.wavelength_min_um}–${c.wavelength_max_um} µm (${c.n_exposures} exp)`)
                .join('  ·  ')
            : ''}
      </p>
    </section>
  );
}
