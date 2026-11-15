'use client';

import { FlaskConical } from 'lucide-react';

interface SimulatedDataBannerProps {
  isSimulated: boolean;
  onExit?: () => void;
}

/**
 * Shown while Demo mode is on. The user switched it on themselves; the banner makes sure
 * nobody (including a viewer of a shared link) mistakes the frames for real SPHEREx data.
 */
export default function SimulatedDataBanner({ isSimulated, onExit }: SimulatedDataBannerProps) {
  if (!isSimulated) return null;

  return (
    <div
      role="alert"
      data-testid="simulated-data-banner"
      className="flex items-start gap-2 rounded border border-amber-400/60 bg-amber-400/10 p-3 text-xs text-amber-100"
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div className="flex-1 space-y-1">
        <div className="font-mono font-bold uppercase tracking-wide text-amber-300">
          Demo mode · simulated sky, not real SPHEREx images
        </div>
        <p className="text-amber-100/90">
          These frames are generated for demonstration. Any motion or brightness change you see is scripted, not
          observed. Turn Demo mode off to see real SPHEREx data from the archive.
        </p>
      </div>
      {onExit && (
        <button
          onClick={onExit}
          className="shrink-0 rounded border border-amber-400/60 px-2 py-1 font-semibold text-amber-200 hover:bg-amber-400/20"
        >
          Show real data
        </button>
      )}
    </div>
  );
}
