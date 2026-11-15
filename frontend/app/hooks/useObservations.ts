import { useQuery } from '@tanstack/react-query';
import {
  Candidate,
  ComparisonResult,
  EpochsResult,
  Evidence,
  Observation,
  WavelengthBand,
} from '../types';
import type { DetectorArray } from '../config/benchmarks';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function useObservations(
  ra: number,
  dec: number,
  fov = 0.08,
  band?: number,
  array?: DetectorArray | null
) {
  return useQuery<Observation[]>({
    queryKey: ['observations', ra, dec, fov, band, array],
    queryFn: async () => {
      const params = new URLSearchParams({ ra: String(ra), dec: String(dec), fov: String(fov) });
      if (array) {
        params.set('array', array);
      } else if (band !== undefined) {
        // UI and share URLs are one-indexed; the current backend transport is zero-indexed.
        params.set('band', String(Math.max(0, band - 1)));
      }
      const res = await fetch(`${API_BASE}/api/v1/observations?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to query observations: ${res.statusText}`);
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
  array?: DetectorArray | null
) {
  return useQuery<EpochsResult>({
    queryKey: ['epochs', ra, dec, fov, band, array],
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
      const res = await fetch(`${API_BASE}/api/v1/epochs?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load archive epochs: ${res.statusText}`);
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
        throw new Error(`Failed to compare observations: ${res.statusText}`);
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
