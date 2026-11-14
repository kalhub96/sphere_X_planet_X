'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { DETECTOR_ARRAYS, FOV_PRESETS, type DetectorArray } from '../config/benchmarks';
import { useSkyStore, type InvestigationMode } from '../store/skyStore';

const MODES: readonly InvestigationMode[] = ['video', 'blink', 'slider', 'difference', 'false_color'];

function finiteInRange(value: string | null, minimum: number, maximum: number): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function validArray(value: string | null): DetectorArray | null {
  return DETECTOR_ARRAYS.some((array) => array.id === value) ? (value as DetectorArray) : null;
}

/**
 * Keeps the investigation state directly shareable. The query string is
 * hydrated once on entry and then rewritten after each state change.
 */
export function useSkyQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasHydrated = useRef(false);

  const ra = useSkyStore((state) => state.ra);
  const dec = useSkyStore((state) => state.dec);
  const fov = useSkyStore((state) => state.fov);
  const band = useSkyStore((state) => state.selectedBand);
  const array = useSkyStore((state) => state.selectedArray);
  const mode = useSkyStore((state) => state.investigationMode);
  const setCoordinates = useSkyStore((state) => state.setCoordinates);
  const setFov = useSkyStore((state) => state.setFov);
  const setSelectedBand = useSkyStore((state) => state.setSelectedBand);
  const setSelectedArray = useSkyStore((state) => state.setSelectedArray);
  const setInvestigationMode = useSkyStore((state) => state.setInvestigationMode);

  useEffect(() => {
    const urlRa = finiteInRange(searchParams.get('ra'), 0, 360);
    const urlDec = finiteInRange(searchParams.get('dec'), -90, 90);
    const urlFov = finiteInRange(searchParams.get('fov'), 0.05, 0.5);
    const urlBand = finiteInRange(searchParams.get('band'), 0, 101);
    const urlArray = validArray(searchParams.get('array'));
    const urlMode = searchParams.get('mode');

    if (urlRa !== null && urlDec !== null) setCoordinates(urlRa, urlDec);
    if (urlFov !== null && FOV_PRESETS.includes(urlFov as (typeof FOV_PRESETS)[number])) setFov(urlFov);
    if (urlBand !== null) setSelectedBand(urlBand);
    setSelectedArray(urlArray);
    if (urlMode !== null && MODES.includes(urlMode as InvestigationMode)) {
      setInvestigationMode(urlMode as InvestigationMode);
    }
    hasHydrated.current = true;
  }, [searchParams, setCoordinates, setFov, setInvestigationMode, setSelectedArray, setSelectedBand]);

  useEffect(() => {
    if (!hasHydrated.current) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('ra', ra.toFixed(6));
    next.set('dec', dec.toFixed(6));
    next.set('fov', fov.toFixed(2));
    next.set('band', String(band));
    next.set('array', array ?? 'single');
    next.set('mode', mode);
    const query = next.toString();
    if (query !== searchParams.toString()) {
      router.replace(`${pathname}?${query}`, { scroll: false });
    }
  }, [array, band, dec, fov, mode, pathname, ra, router, searchParams]);
}
