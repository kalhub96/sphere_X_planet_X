'use client';

import { Minus, Plus, X } from 'lucide-react';

import type { CombineRole } from '../../store/skyStore';
import type { EpochFrame } from '../../types';

interface CombinePanelProps {
  epochs: Pick<EpochFrame, 'epoch_index' | 'obs_date'>[];
  plus: number[];
  minus: number[];
  onRole: (epoch: number, role: CombineRole) => void;
  onClear: () => void;
  loading: boolean;
  resultLabel?: string | null;
  resultKind?: 'stack' | 'difference' | null;
}

/**
 * Pick which survey epochs to add together (+) and which to subtract (−).
 * The maths runs on the real calibrated pixels in the backend, not on the PNGs.
 */
export default function CombinePanel({
  epochs,
  plus,
  minus,
  onRole,
  onClear,
  loading,
  resultLabel,
  resultKind,
}: CombinePanelProps) {
  const roleOf = (epoch: number): CombineRole =>
    plus.includes(epoch) ? 'plus' : minus.includes(epoch) ? 'minus' : 'off';

  return (
    <section className="glass-panel space-y-3 border border-[var(--border-subtle)] p-4 text-xs" data-testid="combine-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold uppercase tracking-wide text-[var(--accent-cyan)]">Add / subtract epochs</h2>
        {(plus.length > 0 || minus.length > 0) && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      <p className="leading-relaxed text-[var(--text-secondary)]">
        Mark epochs <strong className="text-[var(--accent-orange)]">+</strong> to stack them (a median stack improves
        signal-to-noise). Also mark some <strong className="text-[var(--accent-cyan)]">−</strong> to see what changed:
        the result is <em>(+ stack) − (− stack)</em>, where <span className="text-[#ff6b6b]">red</span> is brighter in
        the + epochs and <span className="text-[#6ba8ff]">blue</span> is brighter in the − epochs. Moving objects show
        up as a red and blue pair.
      </p>

      {epochs.length === 0 ? (
        <p className="text-[var(--text-muted)]">Epochs appear here once the archive frames have loaded.</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {epochs.map((epoch) => {
            const role = roleOf(epoch.epoch_index);
            return (
              <li
                key={epoch.epoch_index}
                className="flex items-center justify-between gap-2 rounded border border-[var(--border-subtle)] bg-black/20 px-2 py-1.5"
              >
                <span className="font-mono">
                  E{epoch.epoch_index} · {epoch.obs_date}
                </span>
                <span className="flex gap-1" role="group" aria-label={`Epoch ${epoch.epoch_index} role`}>
                  <button
                    onClick={() => onRole(epoch.epoch_index, role === 'plus' ? 'off' : 'plus')}
                    aria-pressed={role === 'plus'}
                    title="Add this epoch"
                    className={`rounded p-1 ${role === 'plus' ? 'bg-[var(--accent-orange)] text-[#060810]' : 'bg-white/5 hover:bg-white/10'}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onRole(epoch.epoch_index, role === 'minus' ? 'off' : 'minus')}
                    aria-pressed={role === 'minus'}
                    title="Subtract this epoch"
                    className={`rounded p-1 ${role === 'minus' ? 'bg-[var(--accent-cyan)] text-[#060810]' : 'bg-white/5 hover:bg-white/10'}`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="font-mono text-[11px] text-[var(--text-secondary)]">
        {plus.length === 0
          ? 'Choose at least one epoch to add.'
          : loading
            ? 'Computing from the archive pixels…'
            : resultLabel
              ? `Showing: ${resultLabel}${resultKind === 'difference' ? ' (signal-to-noise)' : ' (median stack)'}`
              : ''}
      </p>
    </section>
  );
}
