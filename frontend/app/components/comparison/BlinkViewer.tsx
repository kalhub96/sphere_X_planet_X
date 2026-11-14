'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Maximize2,
  Pause,
  Play,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import type { Candidate, EpochFrame, WCSHeader } from '../../types';
import type { InvestigationMode } from '../../store/skyStore';

export type BlinkViewMode = InvestigationMode;

interface ViewerFrame {
  id: string;
  label: string;
  imageB64: string;
  epochMjd?: number;
  wcs?: WCSHeader;
  flags?: EpochFrame['flags'];
}

interface BlinkViewerProps {
  imageABase64?: string;
  imageBBase64?: string;
  differenceBase64?: string | null;
  falseColorBase64?: string | null;
  frames?: ViewerFrame[];
  candidates: Candidate[];
  selectedCandidateId?: string | null;
  onCandidateSelect?: (candidate: Candidate) => void;
  epochALabel?: string;
  epochBLabel?: string;
  mode?: BlinkViewMode;
  onModeChange?: (mode: BlinkViewMode) => void;
}

function imageSource(value: string): string {
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

function candidatePixel(candidate: Candidate, wcs?: WCSHeader): [number, number] {
  if (!wcs) return [candidate.pixel_x, candidate.pixel_y];
  const cosDec = Math.cos((wcs.crval2 * Math.PI) / 180);
  const dRa = (candidate.ra_deg - wcs.crval1) * cosDec;
  const dDec = candidate.dec_deg - wcs.crval2;
  const determinant = wcs.cd1_1 * wcs.cd2_2 - wcs.cd1_2 * wcs.cd2_1;
  if (Math.abs(determinant) < 1e-12) return [candidate.pixel_x, candidate.pixel_y];
  return [
    (wcs.cd2_2 * dRa - wcs.cd1_2 * dDec) / determinant + wcs.crpix1 - 1,
    (wcs.cd1_1 * dDec - wcs.cd2_1 * dRa) / determinant + wcs.crpix2 - 1,
  ];
}

export default function BlinkViewer({
  imageABase64 = '',
  imageBBase64 = '',
  differenceBase64,
  falseColorBase64,
  frames,
  candidates,
  selectedCandidateId = null,
  onCandidateSelect,
  epochALabel = 'Epoch 1',
  epochBLabel = 'Epoch 2',
  mode = 'video',
  onModeChange,
}: BlinkViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const diffRef = useRef<HTMLImageElement | null>(null);
  const falseColorRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [viewMode, setViewMode] = useState<BlinkViewMode>(mode);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(1.5);
  const [blinkA, setBlinkA] = useState(true);
  const [split, setSplit] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<Candidate | null>(null);
  const dragging = useRef<'pan' | 'split' | null>(null);
  const dragOrigin = useRef({ x: 0, y: 0 });

  const timeline = useMemo<ViewerFrame[]>(() => {
    if (frames && frames.length > 0) return frames;
    return [
      { id: 'a', label: epochALabel, imageB64: imageABase64 },
      { id: 'b', label: epochBLabel, imageB64: imageBBase64 },
    ].filter((frame) => frame.imageB64);
  }, [epochALabel, epochBLabel, frames, imageABase64, imageBBase64]);

  const changeMode = useCallback((nextMode: BlinkViewMode) => {
    setViewMode(nextMode);
    onModeChange?.(nextMode);
    if (nextMode === 'video') setIsPlaying(true);
  }, [onModeChange]);

  useEffect(() => {
    setViewMode(mode);
  }, [mode]);

  useEffect(() => {
    setFrameIndex((current) => Math.min(current, Math.max(0, timeline.length - 1)));
    setReady(false);
    const pending: HTMLImageElement[] = [];
    const resources = [
      ...timeline.map((frame) => frame.imageB64),
      differenceBase64 ?? '',
      falseColorBase64 ?? '',
    ].filter(Boolean);
    if (resources.length === 0) return;
    let loaded = 0;
    const onSettled = () => {
      loaded += 1;
      if (loaded === resources.length) setReady(true);
    };
    timeline.forEach((frame) => {
      const image = new Image();
      image.onload = onSettled;
      image.onerror = onSettled;
      image.src = imageSource(frame.imageB64);
      pending.push(image);
    });
    imagesRef.current = pending;
    if (differenceBase64) {
      const image = new Image();
      image.onload = onSettled;
      image.onerror = onSettled;
      image.src = imageSource(differenceBase64);
      diffRef.current = image;
    } else {
      diffRef.current = null;
    }
    if (falseColorBase64) {
      const image = new Image();
      image.onload = onSettled;
      image.onerror = onSettled;
      image.src = imageSource(falseColorBase64);
      falseColorRef.current = image;
    } else {
      falseColorRef.current = null;
    }
  }, [differenceBase64, falseColorBase64, timeline]);

  const activeFrame = timeline[frameIndex];
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || timeline.length === 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    const first = imagesRef.current[0];
    const last = imagesRef.current[imagesRef.current.length - 1];
    const video = imagesRef.current[frameIndex] ?? first;
    const blink = blinkA ? first : last;

    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(width / 2 + pan.x, height / 2 + pan.y);
    context.scale(zoom, zoom);
    context.translate(-width / 2, -height / 2);
    context.imageSmoothingEnabled = false;

    if (viewMode === 'video' && video) context.drawImage(video, 0, 0, width, height);
    if (viewMode === 'blink' && blink) context.drawImage(blink, 0, 0, width, height);
    if (viewMode === 'difference' && (diffRef.current ?? last)) {
      context.drawImage(diffRef.current ?? last, 0, 0, width, height);
    }
    if (viewMode === 'false_color' && (falseColorRef.current ?? last)) {
      context.drawImage(falseColorRef.current ?? last, 0, 0, width, height);
    }
    if (viewMode === 'slider') {
      const splitX = split * width;
      if (first) context.drawImage(first, 0, 0, width, height);
      context.save();
      context.beginPath();
      context.rect(splitX, 0, width - splitX, height);
      context.clip();
      if (last) context.drawImage(last, 0, 0, width, height);
      context.restore();
      context.strokeStyle = '#00e5ff';
      context.lineWidth = 2 / zoom;
      context.beginPath();
      context.moveTo(splitX, 0);
      context.lineTo(splitX, height);
      context.stroke();
    }

    const sourceWidth = Math.max(1, (activeFrame?.wcs?.crpix1 ?? 256) * 2);
    const sourceHeight = Math.max(1, (activeFrame?.wcs?.crpix2 ?? 256) * 2);
    candidates.forEach((candidate) => {
      const [x, y] = candidatePixel(candidate, activeFrame?.wcs);
      const px = (x / sourceWidth) * width;
      const py = (y / sourceHeight) * height;
      const selected = candidate.id === selectedCandidateId;
      const radius = (selected ? 13 : 9) / zoom;
      context.beginPath();
      context.arc(px, py, radius, 0, Math.PI * 2);
      context.strokeStyle = selected ? '#00e5ff' : '#ffd166';
      context.lineWidth = 2 / zoom;
      context.stroke();
      context.fillStyle = '#f0f4ff';
      context.font = `${10 / zoom}px monospace`;
      context.fillText(`${candidate.snr_change >= 0 ? '+' : ''}${candidate.snr_change.toFixed(1)}σ`, px + radius + 3, py);
    });
    context.restore();
  }, [activeFrame?.wcs, blinkA, candidates, frameIndex, pan, ready, selectedCandidateId, split, timeline.length, viewMode, zoom]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    if (!isPlaying || timeline.length < 2) return;
    const timer = window.setInterval(() => {
      if (viewMode === 'blink') setBlinkA((value) => !value);
      if (viewMode === 'video') setFrameIndex((value) => (value + 1) % timeline.length);
    }, 1000 / fps);
    return () => window.clearInterval(timer);
  }, [fps, isPlaying, timeline.length, viewMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setIsPlaying((value) => !value);
      } else if (event.key === 'ArrowRight') {
        setFrameIndex((value) => Math.min(value + 1, timeline.length - 1));
        setIsPlaying(false);
      } else if (event.key === 'ArrowLeft') {
        setFrameIndex((value) => Math.max(value - 1, 0));
        setIsPlaying(false);
      } else if (event.key.toLowerCase() === 'd') {
        changeMode('difference');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changeMode, timeline.length]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const findCandidate = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const sourceWidth = Math.max(1, (activeFrame?.wcs?.crpix1 ?? 256) * 2);
    const sourceHeight = Math.max(1, (activeFrame?.wcs?.crpix2 ?? 256) * 2);
    return candidates.find((candidate) => {
      const [sourceX, sourceY] = candidatePixel(candidate, activeFrame?.wcs);
      return Math.hypot((sourceX / sourceWidth) * canvas.width - x, (sourceY / sourceHeight) * canvas.height - y) < 18;
    }) ?? null;
  };

  const displayFrame = viewMode === 'blink' ? (blinkA ? timeline[0] : timeline[timeline.length - 1]) : activeFrame;
  const modeOptions: ReadonlyArray<{ id: BlinkViewMode; label: string }> = [
    { id: 'video', label: 'Video loop' },
    { id: 'blink', label: 'A / B blink' },
    { id: 'slider', label: 'Split slider' },
    { id: 'difference', label: 'N − 1 difference' },
    { id: 'false_color', label: 'False color' },
  ];

  return (
    <section className="glass-panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border-subtle)] bg-black/30 p-1">
          {modeOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => changeMode(option.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${viewMode === option.id ? 'bg-[var(--accent-cyan)] text-[#060810]' : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {(viewMode === 'video' || viewMode === 'blink') && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <button onClick={() => setIsPlaying((value) => !value)} className="rounded bg-white/10 p-1.5 hover:bg-white/20" title="Play / pause">
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent-cyan)]" />
            <input type="range" min="0.5" max="10" step="0.5" value={fps} onChange={(event) => setFps(Number(event.target.value))} className="w-20 accent-[var(--accent-cyan)]" />
            <span>{fps.toFixed(1)} FPS</span>
          </div>
        )}
      </div>

      <div className="relative aspect-square max-h-[600px] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[#020408]">
        <canvas
          ref={canvasRef}
          width={512}
          height={512}
          className="h-full w-full touch-none cursor-crosshair"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const { x, y } = point(event);
            if (viewMode === 'slider' && Math.abs(x - split * 512) < 20) {
              dragging.current = 'split';
            } else {
              dragging.current = 'pan';
              dragOrigin.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
            }
          }}
          onPointerMove={(event) => {
            const { x, y } = point(event);
            if (dragging.current === 'split') setSplit(Math.max(0.02, Math.min(0.98, x / 512)));
            if (dragging.current === 'pan') setPan({ x: event.clientX - dragOrigin.current.x, y: event.clientY - dragOrigin.current.y });
            if (dragging.current === null) setHovered(findCandidate(x, y));
          }}
          onPointerUp={(event) => {
            dragging.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onClick={(event) => {
            const { x, y } = point(event as unknown as React.PointerEvent<HTMLCanvasElement>);
            const candidate = findCandidate(x, y);
            if (candidate) onCandidateSelect?.(candidate);
          }}
          onWheel={(event) => {
            event.preventDefault();
            setZoom((value) => Math.max(0.5, Math.min(8, value * (event.deltaY < 0 ? 1.15 : 0.87))));
          }}
        />
        {displayFrame && (
          <div className="absolute left-3 top-3 rounded border border-[var(--accent-cyan)] bg-[#060810cc] px-2 py-1 text-[11px] font-mono text-[var(--accent-cyan)]">
            Epoch {viewMode === 'video' ? frameIndex + 1 : blinkA ? 1 : timeline.length} / {timeline.length} · {displayFrame.label}
          </div>
        )}
        {activeFrame?.flags && (
          <div className="absolute right-3 top-3 rounded border border-[var(--border-subtle)] bg-[#060810cc] px-2 py-1 text-[10px] font-mono text-[var(--text-secondary)]">
            Clean {activeFrame.flags.clean_pct.toFixed(1)}% · Flags {activeFrame.flags.bad_px}
          </div>
        )}
        {!ready && <div className="absolute inset-0 grid place-items-center text-xs font-mono text-[var(--text-secondary)]">Loading archive frames…</div>}
        {hovered && (
          <div className="absolute bottom-3 left-3 max-w-xs rounded border border-[var(--accent-gold)] bg-[#060810dd] p-2 text-[10px] font-mono text-[var(--text-primary)]">
            <div className="font-bold text-[var(--accent-gold)]">{hovered.classification}</div>
            ΔSNR {hovered.snr_change.toFixed(1)}σ · confidence {(hovered.confidence_score * 100).toFixed(0)}%
          </div>
        )}
      </div>

      {viewMode === 'video' && (
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
          <button onClick={() => { setFrameIndex((value) => Math.max(0, value - 1)); setIsPlaying(false); }} className="rounded bg-white/5 p-1 hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
          <input type="range" min="0" max={Math.max(0, timeline.length - 1)} step="1" value={frameIndex} onChange={(event) => { setFrameIndex(Number(event.target.value)); setIsPlaying(false); }} className="flex-1 accent-[var(--accent-cyan)]" aria-label="Epoch frame scrubber" />
          <button onClick={() => { setFrameIndex((value) => Math.min(timeline.length - 1, value + 1)); setIsPlaying(false); }} className="rounded bg-white/5 p-1 hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
          <span>{frameIndex + 1}/{timeline.length}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1"><Info className="h-3.5 w-3.5 text-[var(--accent-cyan)]" /> WCS-projected rings; flag counts are carried from the FITS FLAGS HDU.</span>
        <div className="flex gap-1">
          <button onClick={() => setZoom((value) => Math.min(8, value * 1.25))} className="rounded bg-white/5 p-1 hover:bg-white/10"><ZoomIn className="h-3.5 w-3.5" /></button>
          <button onClick={() => setZoom((value) => Math.max(0.5, value / 1.25))} className="rounded bg-white/5 p-1 hover:bg-white/10"><ZoomOut className="h-3.5 w-3.5" /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded bg-white/5 p-1 hover:bg-white/10"><Maximize2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <p className="flex items-start gap-1 text-[10px] text-[var(--text-muted)]"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[var(--accent-orange)]" /> Automated detections are leads, not discoveries. Inspect contamination flags, SNR, and the linked IRSA cutout before interpreting a source.</p>
    </section>
  );
}
