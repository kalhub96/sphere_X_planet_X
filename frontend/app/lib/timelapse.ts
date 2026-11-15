export interface TimelapseFrame {
  index: number;
  obs_id: string;
  epoch_mjd: number;
  obs_date: string;
  wavelength_um: number;
  detector: number;
  quality_pct: number;
  image_b64: string;
}

export interface TimelapseResult {
  source: 'irsa' | 'synthetic';
  ra: number;
  dec: number;
  fov_arcmin: number;
  size_px: number;
  pixel_scale_arcsec: number;
  collection: string;
  notes: string[];
  frames: TimelapseFrame[];
}

export interface TimelapsePreset {
  label: string;
  note: string;
  ra?: number;
  dec?: number;
  /** Resolved through CDS Sesame when coordinates are not hard-coded. */
  resolveName?: string;
  fov: number;
}

// Coordinates are ICRS/J2000 catalogue positions; fast movers will have shifted by 2025+.
export const TEST_TARGETS: TimelapsePreset[] = [
  { label: "Barnard's Star", note: 'Proper motion 10.3″/yr', ra: 269.452, dec: 4.693, fov: 5 },
  { label: 'Epsilon Indi B', note: 'Brown-dwarf pair; resolved by name', resolveName: 'eps Ind B', fov: 10 },
  { label: 'WISE 0855−0714', note: 'Fast-moving brown dwarf', ra: 133.795128, dec: -7.245147, fov: 5 },
  { label: 'RW Aurigae', note: 'Variable star', ra: 76.95654, dec: 30.401444, fov: 5 },
  { label: 'R Draconis', note: 'Variable star; resolved by name', resolveName: 'R Dra', fov: 5 },
];

/** Parses "269.452", "17h57m48.5s", "17 57 48.5" (hours if `isRA`) or "+04d41m36s". Returns degrees or null. */
export function parseAngle(input: string, isRA: boolean): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const m = s.match(/^([+-])?\s*(\d+(?:\.\d+)?)\s*[hd: ]\s*(\d+(?:\.\d+)?)\s*[m': ]\s*(\d+(?:\.\d+)?)?\s*[s"]?$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const v = parseFloat(m[2]) + parseFloat(m[3]) / 60 + (m[4] ? parseFloat(m[4]) / 3600 : 0);
  return sign * (isRA ? v * 15 : v);
}

/** Strict CDS Sesame lookup (no fuzzy fallback, so a failed name never silently points somewhere else). */
export async function sesameResolve(name: string): Promise<{ ra: number; dec: number } | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(`https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?${encodeURIComponent(name)}`, {
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const txt = await res.text();
    const ra = txt.match(/<jradeg>([\d.+-]+)<\/jradeg>/);
    const dec = txt.match(/<jdedeg>([\d.+-]+)<\/jdedeg>/);
    return ra && dec ? { ra: parseFloat(ra[1]), dec: parseFloat(dec[1]) } : null;
  } catch {
    return null;
  }
}

export type DiffMode = 'raw' | 'minus_first' | 'running';

/** Decode a base64 PNG into 8-bit grayscale pixels (luma of the red channel is enough; frames are gray). */
export async function decodeGray(b64: string, size: number): Promise<Uint8ClampedArray> {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size).data;
  const out = new Uint8ClampedArray(size * size);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
  return out;
}

/** Signed difference rendered blue (negative) / black (0) / orange (positive), as RGBA. */
export function diffToRGBA(a: Uint8ClampedArray, b: Uint8ClampedArray, gain = 3): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length * 4);
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] - b[i]) * gain;
    const p = Math.max(0, d);
    const n = Math.max(0, -d);
    out[i * 4] = p;
    out[i * 4 + 1] = p * 0.42 + n * 0.9;
    out[i * 4 + 2] = n;
    out[i * 4 + 3] = 255;
  }
  return out;
}
