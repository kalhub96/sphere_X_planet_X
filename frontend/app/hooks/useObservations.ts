import { useQuery } from '@tanstack/react-query';
import {
  Candidate,
  ComparisonResult,
  CombineResult,
  EpochsResult,
  FalseColorResult,
  Evidence,
  Observation,
  WavelengthBand,
} from '../types';
import type { DetectorArray } from '../config/benchmarks';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** Turn a failed API response into a readable message (the backend explains what went wrong). */
async function readError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    if (body && typeof body.detail === 'string') return new Error(body.detail);
  } catch {
    // body was not JSON
  }
  return new Error(`${fallback} (${res.status} ${res.statusText})`.trim());
}

export function useObservations(
  ra: number,
  dec: number,
  fov = 0.08,
  band?: number,
  array?: DetectorArray | null,
  simulate = false
) {
  return useQuery<Observation[]>({
    queryKey: ['observations', ra, dec, fov, band, array, simulate],
    queryFn: async () => {
      const params = new URLSearchParams({ ra: String(ra), dec: String(dec), fov: String(fov) });
      if (array) {
        params.set('array', array);
      } else if (band !== undefined) {
        // UI and share URLs are one-indexed; the current backend transport is zero-indexed.
        params.set('band', String(Math.max(0, band - 1)));
      }
      if (simulate) params.set('simulate', 'true');
      const res = await fetch(`${API_BASE}/api/v1/observations?${params.toString()}`);
      if (!res.ok) {
        throw await readError(res, 'Failed to query observations');
      }
      const items: Observation[] = await res.json();
      return (items || []).map((obs) => {
        const r = typeof obs.ra === 'number' ? obs.ra : (obs.ra_deg ?? 0);
        const d = typeof obs.dec === 'number' ? obs.dec : (obs.dec_deg ?? 0);
        return {
          ...obs,
          ra: r,
          dec: d,
          ra_deg: r,
          dec_deg: d,
        };
      });
    },
    enabled: typeof ra === 'number' && typeof dec === 'number' && !isNaN(ra) && !isNaN(dec),
    staleTime: 5 * 60 * 1000,
  });
}

function normalizeCandidate(c: any, defaultComparisonId = ''): Candidate {
  const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  const raVal = num(c.ra_deg ?? c.ra);
  const decVal = num(c.dec_deg ?? c.dec);
  return {
    ...c,
    id: String(c.id ?? `cand_${Math.random()}`),
    comparison_id: c.comparison_id ?? defaultComparisonId,
    ra_deg: raVal,
    dec_deg: decVal,
    ra: raVal,
    dec: decVal,
    pixel_x: num(c.pixel_x),
    pixel_y: num(c.pixel_y),
    snr_change: num(c.snr_change ?? c.snr),
    confidence_score: num(c.confidence_score ?? c.confidence),
    classification: c.classification ?? 'Unclassified',
    caveats: Array.isArray(c.caveats) ? c.caveats : [],
    proper_motion_mas_yr: c.proper_motion_mas_yr ?? (c.motion_arcsec_yr ? c.motion_arcsec_yr * 1000 : undefined),
    parallax_distance_pc: c.parallax_distance_pc,
    solar_system_crossmatch: c.solar_system_crossmatch,
  };
}

export function useEpochs(
  ra: number,
  dec: number,
  fov: number,
  band: number,
  array?: DetectorArray | null,
  simulate = false
) {
  return useQuery<EpochsResult>({
    queryKey: ['epochs', ra, dec, fov, band, array, simulate],
    retry: 1,
    queryFn: async () => {
      const params = new URLSearchParams({
        ra: String(ra),
        dec: String(dec),
        fov: String(fov),
        stretch: 'asinh',
      });
      if (array) {
        params.set('array', array);
      } else {
        params.set('band', String(Math.max(0, band - 1)));
      }
      if (simulate) params.set('simulate', 'true');
      const res = await fetch(`${API_BASE}/api/v1/epochs?${params.toString()}`);
      if (!res.ok) {
        throw await readError(res, 'Failed to load archive epochs');
      }
      const data: EpochsResult = await res.json();
      if (Array.isArray(data.candidates)) {
        data.candidates = data.candidates.map((c) => normalizeCandidate(c, `epoch_${ra.toFixed(4)}_${dec.toFixed(4)}`));
      }
      return data;
    },
    enabled: Number.isFinite(ra) && Number.isFinite(dec),
    staleTime: 30 * 60 * 1000,
  });
}

export function useCombine(
  ra: number,
  dec: number,
  fov: number,
  band: number,
  array: DetectorArray | null | undefined,
  plus: number[],
  minus: number[],
  simulate: boolean,
  enabled: boolean
) {
  return useQuery<CombineResult>({
    queryKey: ['combine', ra, dec, fov, band, array, plus.join(','), minus.join(','), simulate],
    retry: 1,
    queryFn: async () => {
      const params = new URLSearchParams({
        ra: String(ra),
        dec: String(dec),
        fov: String(fov),
        plus: plus.join(','),
      });
      if (minus.length > 0) params.set('minus', minus.join(','));
      if (array) params.set('array', array);
      else params.set('band', String(Math.max(0, band - 1)));
      if (simulate) params.set('simulate', 'true');
      const res = await fetch(`${API_BASE}/api/v1/epochs/combine?${params.toString()}`);
      if (!res.ok) throw await readError(res, 'Failed to combine epochs');
      return res.json();
    },
    enabled: enabled && plus.length > 0 && Number.isFinite(ra) && Number.isFinite(dec),
    staleTime: 30 * 60 * 1000,
  });
}

export function useFalseColor(
  ra: number,
  dec: number,
  fov: number,
  red: string,
  green: string,
  blue: string,
  epoch: number | null,
  simulate: boolean,
  enabled: boolean
) {
  return useQuery<FalseColorResult>({
    queryKey: ['falsecolor', ra, dec, fov, red, green, blue, epoch, simulate],
    retry: 1,
    queryFn: async () => {
      const params = new URLSearchParams({
        ra: String(ra),
        dec: String(dec),
        fov: String(fov),
        red,
        green,
        blue,
      });
      if (epoch !== null) params.set('epoch', String(epoch));
      if (simulate) params.set('simulate', 'true');
      const res = await fetch(`${API_BASE}/api/v1/falsecolor?${params.toString()}`);
      if (!res.ok) throw await readError(res, 'Failed to build the false-colour image');
      return res.json();
    },
    enabled: enabled && Number.isFinite(ra) && Number.isFinite(dec),
    staleTime: 30 * 60 * 1000,
  });
}

export function useWavelengths() {
  return useQuery<WavelengthBand[]>({
    queryKey: ['wavelengths'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/wavelengths`);
      if (!res.ok) {
        throw new Error(`Failed to fetch wavelengths: ${res.statusText}`);
      }
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });
}

// Backend returns candidates as {ra, dec, ...}; the UI expects {ra_deg, dec_deg, ...}.
function normalizeComparison(data: any): ComparisonResult {
  const comparison_id = data?.comparison_id ?? '';
  const candidates = (data?.candidates ?? []).map((c: any) => normalizeCandidate(c, comparison_id));
  return { ...data, candidates };
}

export function useComparison(obsAId: string | null, obsBId: string | null, band = 50) {
  return useQuery<ComparisonResult>({
    queryKey: ['comparison', obsAId, obsBId, band],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/api/v1/compare?obs_a=${encodeURIComponent(obsAId!)}&obs_b=${encodeURIComponent(obsBId!)}&band=${band}`
      );
      if (!res.ok) {
        throw await readError(res, 'Failed to compare observations');
      }
      const data = await res.json();
      return normalizeComparison(data);
    },
    enabled: !!obsAId && !!obsBId,
    staleTime: 30 * 60 * 1000,
  });
}

export function useEvidence(candidateId: string | null) {
  return useQuery<Evidence>({
    queryKey: ['evidence', candidateId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/candidates/${candidateId}/evidence`);
      if (!res.ok) {
        throw new Error(`Failed to fetch candidate evidence: ${res.statusText}`);
      }
      return res.json();
    },
    enabled: !!candidateId,
    staleTime: 30 * 60 * 1000,
  });
}

export interface CandidateSEDResponse {
  candidate_id: string;
  ra?: number;
  dec?: number;
  is_simulated: boolean;
  data_source: 'live_fits_photometry' | 'simulated_photometry' | 'template_model' | string;
  measured_bands_count?: number;
  note?: string;
  best_template: string;
  reduced_chi2: number;
  bands: Array<{
    band_index: number;
    wavelength_um: number;
    flux_density: number;
    flux_uncertainty: number;
    measured?: boolean;
  }>;
}

export function useCandidateSED(
  candidateId: string | null | undefined,
  ra?: number,
  dec?: number,
  simulate = false
) {
  const resolvedId = candidateId || 'sky_patch';
  return useQuery<CandidateSEDResponse>({
    queryKey: ['candidate-sed', resolvedId, ra, dec, simulate],
    retry: 1,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeof ra === 'number' && Number.isFinite(ra)) params.set('ra', String(ra));
      if (typeof dec === 'number' && Number.isFinite(dec)) params.set('dec', String(dec));
      if (simulate) params.set('simulate', 'true');
      const qs = params.toString();
      const url = `${API_BASE}/api/v1/candidates/${encodeURIComponent(resolvedId)}/sed${qs ? `?${qs}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw await readError(res, 'Failed to extract 102-band SED');
      }
      return res.json();
    },
    enabled: Boolean(candidateId) || (typeof ra === 'number' && Number.isFinite(ra) && typeof dec === 'number' && Number.isFinite(dec)),
    staleTime: 15 * 60 * 1000,
  });
}
