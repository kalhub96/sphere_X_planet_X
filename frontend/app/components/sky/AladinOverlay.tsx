'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Script from 'next/script';
import { ExternalLink, MapPinned } from 'lucide-react';

interface AladinInstance {
  gotoRaDec: (ra: number, dec: number) => void;
  setFoV: (fov: number) => void;
  addCatalog: (catalog: unknown) => void;
}

interface AladinFactory {
  aladin: (selector: string, options: Record<string, unknown>) => AladinInstance;
  catalogFromVizieR: (catalog: string, target: string, radius: number, options?: Record<string, unknown>) => unknown;
}

declare global {
  interface Window {
    A?: AladinFactory;
  }
}

interface AladinOverlayProps {
  ra: number;
  dec: number;
  fov: number;
}

/** Cross-mission context: Gaia DR3 positions over the 2010–2014 unWISE view. */
export default function AladinOverlay({ ra, dec, fov }: AladinOverlayProps) {
  const generatedId = useId().replace(/:/g, '');
  const containerId = `aladin-${generatedId}`;
  const aladinRef = useRef<AladinInstance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialise = useCallback(() => {
    if (!window.A || aladinRef.current) return;
    try {
      const target = `${ra} ${dec}`;
      const aladin = window.A.aladin(`#${containerId}`, {
        target,
        fov,
        survey: 'P/unWISE/color-W2-W1W2-W1',
        showReticle: true,
        showFullscreenControl: false,
        showLayersControl: true,
      });
      aladin.addCatalog(
        window.A.catalogFromVizieR('I/355/gaiadr3', target, fov / 2, {
          name: 'Gaia DR3',
          color: '#00e5ff',
          sourceSize: 6,
        })
      );
      aladinRef.current = aladin;
      setLoaded(true);
    } catch {
      setError('Aladin Lite could not initialise for this field.');
    }
  }, [containerId, dec, fov, ra]);

  useEffect(() => {
    if (aladinRef.current) {
      aladinRef.current.gotoRaDec(ra, dec);
      aladinRef.current.setFoV(fov);
    }
  }, [dec, fov, ra]);

  return (
    <section className="glass-panel overflow-hidden border border-[var(--border-subtle)]">
      <Script
        src="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js"
        strategy="afterInteractive"
        onLoad={initialise}
        onError={() => setError('Aladin Lite failed to load.')}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
          <MapPinned className="h-4 w-4 text-[var(--accent-cyan)]" />
          Gaia DR3 + unWISE verification overlay
        </div>
        <span className="rounded bg-[rgba(0,229,255,0.1)] px-2 py-0.5 text-[10px] font-mono text-[var(--accent-cyan)]">
          unWISE 2010–2014 ↔ SPHEREx 2025–2026 ≈ 15 years
        </span>
      </div>
      <div id={containerId} className="h-72 w-full bg-[#020408]" />
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[10px] font-mono text-[var(--text-secondary)]">
        <span>{loaded ? `Synced: ${ra.toFixed(4)}°, ${dec.toFixed(4)}° · ${fov.toFixed(2)}°` : error ?? 'Loading overlay…'}</span>
        <a
          href="https://aladin.cds.unistra.fr/AladinLite/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[var(--accent-cyan)] hover:underline"
        >
          Aladin Lite <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}
