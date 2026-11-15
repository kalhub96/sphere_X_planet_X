'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Link2, Loader2, Pause, Play, SkipBack, SkipForward, Telescope } from 'lucide-react';
import {
  DiffMode,
  TEST_TARGETS,
  TimelapseResult,
  decodeGray,
  diffToRGBA,
  parseAngle,
  sesameResolve,
} from '../lib/timelapse';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const FOVS = [2, 5, 10, 20];
const MODES: { id: DiffMode; label: string }[] = [
  { id: 'raw', label: 'Image' },
  { id: 'minus_first', label: 'Minus first epoch' },
  { id: 'running', label: 'Minus previous' },
];

interface Query {
  ra: number;
  dec: number;
  fov: number;
  det: number;
}

function num(v: string | null, d: number) {
  const n = v === null ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

function TimelapseInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const embed = sp.get('embed') === '1';

  const hasCoords = sp.get('ra') !== null && sp.get('dec') !== null;
  const query: Query | null = hasCoords
    ? {
        ra: num(sp.get('ra'), 0),
        dec: num(sp.get('dec'), 0),
        fov: num(sp.get('fov'), 5),
        det: Math.round(num(sp.get('det'), 0)),
      }
    : null;

  // Form state (committed to the URL on submit so every view is a shareable link)
  const [raStr, setRaStr] = useState(sp.get('ra') ?? '');
  const [decStr, setDecStr] = useState(sp.get('dec') ?? '');
  const [fov, setFov] = useState(query?.fov ?? 5);
  const [det, setDet] = useState(query?.det ?? 0);
  const [formError, setFormError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Playback state
  const [mode, setMode] = useState<DiffMode>((sp.get('mode') as DiffMode) || 'raw');
  const [fps, setFps] = useState(Math.min(10, Math.max(1, num(sp.get('fps'), 4))));
  const [playing, setPlaying] = useState(true);
  const [idx, setIdx] = useState(Math.max(0, Math.round(num(sp.get('frame'), 0))));

  const { data, isFetching, error } = useQuery<TimelapseResult>({
    queryKey: ['timelapse', query?.ra, query?.dec, query?.fov, query?.det],
    enabled: !!query,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const q = query!;
      const url =
        `${API_BASE}/api/v1/timelapse?ra=${q.ra}&dec=${q.dec}&fov=${q.fov}` + (q.det ? `&detector=${q.det}` : '');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      return res.json();
    },
  });

  const frames = data?.frames ?? [];
  const size = data?.size_px ?? 0;

  // Decode frames to grayscale once per result
  const gray = useRef<Uint8ClampedArray[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    gray.current = [];
    if (!data) return;
    Promise.all(data.frames.map((f) => decodeGray(f.image_b64, data.size_px))).then((g) => {
      if (cancelled) return;
      gray.current = g;
      setIdx((i) => Math.min(i, g.length - 1));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Draw
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !ready || !size || !gray.current[idx]) return;
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const cur = gray.current[idx];
    let rgba: Uint8ClampedArray;
    if (mode === 'raw') {
      rgba = new Uint8ClampedArray(cur.length * 4);
      for (let i = 0; i < cur.length; i++) {
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = cur[i];
        rgba[i * 4 + 3] = 255;
      }
    } else {
      const ref = mode === 'minus_first' ? gray.current[0] : gray.current[Math.max(0, idx - 1)];
      rgba = diffToRGBA(cur, ref);
    }
    ctx.putImageData(new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
    // centre crosshair ticks (target position at the epoch the catalogue gives)
    ctx.strokeStyle = 'rgba(0,229,255,0.8)';
    ctx.lineWidth = 1;
    const m = size / 2;
    const t = Math.max(3, size / 24);
    ctx.beginPath();
    ctx.moveTo(m - t * 2, m);
    ctx.lineTo(m - t, m);
    ctx.moveTo(m + t, m);
    ctx.lineTo(m + t * 2, m);
    ctx.moveTo(m, m - t * 2);
    ctx.lineTo(m, m - t);
    ctx.moveTo(m, m + t);
    ctx.lineTo(m, m + t * 2);
    ctx.stroke();
  }, [ready, size, idx, mode]);
  useEffect(draw, [draw]);

  // Playback loop
  useEffect(() => {
    if (!playing || !ready || frames.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % frames.length), 1000 / fps);
    return () => clearInterval(t);
  }, [playing, ready, fps, frames.length]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') {
        setPlaying(false);
        setIdx((i) => Math.min(frames.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setPlaying(false);
        setIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frames.length]);

  const buildUrl = useCallback(
    (extra: Record<string, string | number> = {}) => {
      const p = new URLSearchParams(sp.toString());
      Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)));
      return `/timelapse?${p.toString()}`;
    },
    [sp]
  );

  // Keep mode/fps in the URL for shareable views
  useEffect(() => {
    if (!hasCoords) return;
    const p = new URLSearchParams(sp.toString());
    if (p.get('mode') === mode && p.get('fps') === String(fps)) return;
    p.set('mode', mode);
    p.set('fps', String(fps));
    router.replace(`/timelapse?${p.toString()}`, { scroll: false });
  }, [mode, fps]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (ra: number, dec: number, f = fov, d = det) => {
    setFormError(null);
    if (!(ra >= 0 && ra < 360) || !(dec >= -90 && dec <= 90)) {
      setFormError('RA must be 0–360° (or 0–24h) and Dec −90…+90°.');
      return;
    }
    setRaStr(String(ra));
    setDecStr(String(dec));
    setFov(f);
    setIdx(0);
    router.push(
      buildUrl({ ra: +ra.toFixed(6), dec: +dec.toFixed(6), fov: f, det: d, frame: 0 })
    );
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ra = parseAngle(raStr, /[hms: ]/i.test(raStr) && !/d/i.test(raStr));
    const dec = parseAngle(decStr, false);
    if (ra === null || dec === null) {
      setFormError('Could not parse coordinates. Use decimal degrees or 08h55m10.8s / −07d14m42.5s.');
      return;
    }
    submit(ra, dec);
  };

  const usePreset = async (i: number) => {
    const p = TEST_TARGETS[i];
    setFormError(null);
    if (p.ra !== undefined && p.dec !== undefined) return submit(p.ra, p.dec, p.fov, det);
    setResolving(true);
    const r = await sesameResolve(p.resolveName!);
    setResolving(false);
    if (!r) return setFormError(`Could not resolve “${p.resolveName}” via CDS Sesame. Enter coordinates manually.`);
    submit(r.ra, r.dec, p.fov, det);
  };

  const copyLink = async () => {
    try {
      const u = new URL(buildUrl({ frame: idx }), window.location.origin);
      await navigator.clipboard.writeText(u.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const f = frames[idx];
  const span = useMemo(() => (frames.length > 1 ? frames[frames.length - 1].epoch_mjd - frames[0].epoch_mjd : 0), [frames]);
  const field = 'bg-[rgba(0,0,0,0.5)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-sm font-mono outline-none focus:border-[var(--accent-cyan)]';

  return (
    <div className="min-h-screen bg-[#060810] text-[#F0F4FF] font-sans flex flex-col">
      {!embed && (
        <header className="px-6 py-3 border-b border-[var(--border-subtle)] flex items-center gap-3 sticky top-0 bg-[rgba(6,8,16,0.85)] backdrop-blur-md z-10">
          <Link href="/explore" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            ← Explorer
          </Link>
          <Telescope className="w-5 h-5 text-[var(--accent-cyan)]" />
          <h1 className="text-base font-bold tracking-tight">SPHEREx Time-lapse</h1>
        </header>
      )}

      <main className={`flex-1 w-full max-w-6xl mx-auto ${embed ? 'p-2' : 'p-6'} space-y-4`}>
        {!embed && (
          <section className="glass-panel p-4 space-y-3">
            <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-[var(--text-secondary)] flex flex-col gap-1">
                RA (° or h m s)
                <input className={`${field} w-40`} value={raStr} onChange={(e) => setRaStr(e.target.value)} placeholder="133.7951" />
              </label>
              <label className="text-xs text-[var(--text-secondary)] flex flex-col gap-1">
                Dec (° or d m s)
                <input className={`${field} w-40`} value={decStr} onChange={(e) => setDecStr(e.target.value)} placeholder="-7.2451" />
              </label>
              <label className="text-xs text-[var(--text-secondary)] flex flex-col gap-1">
                Field of view
                <select className={field} value={fov} onChange={(e) => setFov(parseFloat(e.target.value))}>
                  {FOVS.map((v) => (
                    <option key={v} value={v}>{v}′</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[var(--text-secondary)] flex flex-col gap-1">
                Detector
                <select className={field} value={det} onChange={(e) => setDet(parseInt(e.target.value, 10))}>
                  <option value={0}>All 6</option>
                  {[1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>D{d}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-[var(--accent-cyan)] text-[#060810] text-sm font-semibold hover:brightness-110">
                Load
              </button>
            </form>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-[var(--text-muted)]">Test targets:</span>
              {TEST_TARGETS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => usePreset(i)}
                  disabled={resolving}
                  title={p.note}
                  className="px-2.5 py-1 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] hover:border-[var(--border-hover)] disabled:opacity-50"
                >
                  {p.label}
                </button>
              ))}
              {resolving && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-cyan)]" />}
            </div>
            {formError && <p className="text-xs text-[var(--danger)]">{formError}</p>}
          </section>
        )}

        {!query && (
          <p className="text-sm text-[var(--text-secondary)]">
            Enter coordinates or pick a test target. Links like <code className="font-mono">/timelapse?ra=133.7951&amp;dec=-7.2451&amp;fov=5</code> load directly
            (add <code className="font-mono">&amp;embed=1</code> to hide the controls).
          </p>
        )}

        {query && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-8 glass-panel p-3 space-y-3">
              <div className="relative aspect-square max-h-[600px] mx-auto bg-[#020408] rounded-xl overflow-hidden border border-[var(--border-subtle)]">
                <canvas ref={canvasRef} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
                {(isFetching || (data && !ready)) && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs font-mono text-[var(--accent-cyan)] bg-[rgba(2,4,8,0.7)]">
                    <Loader2 className="w-4 h-4 animate-spin" /> Fetching SPHEREx cutouts…
                  </div>
                )}
                {error && !isFetching && (
                  <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[var(--danger)]">
                    Could not load frames: {(error as Error).message}. Is the backend running at {API_BASE}?
                  </div>
                )}
                {f && (
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-mono border border-[var(--accent-cyan)] bg-[rgba(0,229,255,0.15)] text-[var(--accent-cyan)]">
                    {f.obs_date || `MJD ${f.epoch_mjd.toFixed(1)}`} · {idx + 1}/{frames.length}
                  </div>
                )}
              </div>

              {frames.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} className="p-1.5 rounded bg-[rgba(255,255,255,0.08)]" title="Previous (←)"><SkipBack className="w-4 h-4" /></button>
                  <button onClick={() => setPlaying((p) => !p)} className="p-1.5 rounded bg-[rgba(255,255,255,0.08)]" title="Play/pause (Space)">
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { setPlaying(false); setIdx((i) => Math.min(frames.length - 1, i + 1)); }} className="p-1.5 rounded bg-[rgba(255,255,255,0.08)]" title="Next (→)"><SkipForward className="w-4 h-4" /></button>
                  <input type="range" min={0} max={frames.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(parseInt(e.target.value, 10)); }} className="flex-1 min-w-32 accent-[var(--accent-cyan)]" aria-label="Frame" />
                  <label className="flex items-center gap-1.5 text-xs font-mono text-[var(--text-secondary)]">
                    {fps} fps
                    <input type="range" min={1} max={10} value={fps} onChange={(e) => setFps(parseInt(e.target.value, 10))} className="w-20 accent-[var(--accent-cyan)]" aria-label="Frames per second" />
                  </label>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${mode === m.id ? 'bg-[var(--accent-cyan)] text-[#060810]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.06)]'}`}
                  >
                    {m.label}
                  </button>
                ))}
                {mode !== 'raw' && (
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    <span className="text-[#4fa3ff]">blue = fainter</span> · <span className="text-[var(--accent-orange)]">orange = brighter</span>
                  </span>
                )}
                {!embed && (
                  <button onClick={copyLink} className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-cyan)]">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy link'}
                  </button>
                )}
              </div>
            </div>

            {!embed && (
              <aside className="lg:col-span-4 glass-panel p-4 space-y-3 text-xs font-mono">
                {data && (
                  <div className={`flex items-start gap-2 p-2 rounded-lg border ${data.source === 'synthetic' ? 'border-[rgba(255,107,53,0.4)] bg-[rgba(255,107,53,0.08)] text-[var(--accent-orange)]' : 'border-[rgba(6,214,160,0.4)] bg-[rgba(6,214,160,0.08)] text-[var(--accent-green)]'}`}>
                    {data.source === 'synthetic' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <div>
                      <div className="font-bold">{data.source === 'synthetic' ? 'SYNTHETIC DEMO DATA' : `IRSA · ${data.collection}`}</div>
                      {data.notes.map((n) => (
                        <div key={n} className="opacity-80 break-words">{n}</div>
                      ))}
                    </div>
                  </div>
                )}
                {f && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                    <dt className="text-[var(--text-muted)]">Date</dt><dd>{f.obs_date || '—'}</dd>
                    <dt className="text-[var(--text-muted)]">MJD</dt><dd>{f.epoch_mjd.toFixed(3)}</dd>
                    <dt className="text-[var(--text-muted)]">Wavelength</dt><dd>{f.wavelength_um ? `${f.wavelength_um.toFixed(3)} µm` : '—'}</dd>
                    <dt className="text-[var(--text-muted)]">Detector</dt><dd>{f.detector ? `D${f.detector}` : '—'}</dd>
                    <dt className="text-[var(--text-muted)]">Clean pixels</dt>
                    <dd className={f.quality_pct < 80 ? 'text-[var(--danger)]' : ''}>{f.quality_pct.toFixed(0)}%{f.quality_pct < 80 && ' (flagged pixels masked)'}</dd>
                    <dt className="text-[var(--text-muted)]">Observation</dt><dd className="break-all">{f.obs_id}</dd>
                    <dt className="text-[var(--text-muted)]">Baseline</dt><dd>{span.toFixed(0)} d ({frames.length} frames)</dd>
                    <dt className="text-[var(--text-muted)]">FOV</dt><dd>{data?.fov_arcmin}′ · {data?.size_px}px @ {data?.pixel_scale_arcsec}″</dd>
                  </dl>
                )}
                <p className="text-[var(--text-muted)] leading-relaxed">
                  Frames share one brightness stretch and are reprojected onto a common sky grid, so a source that
                  changes position between frames is a mover. Arrow keys step, Space plays.
                </p>
              </aside>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function TimelapsePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#060810]" />}>
      <TimelapseInner />
    </Suspense>
  );
}
