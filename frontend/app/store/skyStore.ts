import { create } from 'zustand';
import { Observation, Candidate } from '../types';
import type { DetectorArray } from '../config/benchmarks';

export type InvestigationMode = 'video' | 'blink' | 'slider' | 'difference' | 'false_color';

export interface HoveredSkyObject {
  name: string;
  ra: number;
  dec: number;
  type: 'Star' | 'Candidate' | 'Planet' | 'Point';
  extra?: string;
}

export interface SkyState {
  // Target Sky Region
  ra: number;
  dec: number;
  /** Full field of view, in degrees. */
  fov: number;
  /** Compatibility radius; always fov / 2. */
  radius: number;
  selectedBand: number; // 1 - 102
  selectedArray: DetectorArray | null;
  investigationMode: InvestigationMode;
  activePresetName: string | null;

  // Multi-epoch Observations
  observations: Observation[];
  selectedObsA: Observation | null;
  selectedObsB: Observation | null;

  // Active Transient Candidate
  activeCandidate: Candidate | null;
  hoveredObject: HoveredSkyObject | null;

  // Actions
  setCoordinates: (ra: number, dec: number, presetName?: string) => void;
  setFov: (fov: number) => void;
  setRadius: (radius: number) => void;
  setSelectedBand: (band: number) => void;
  setSelectedArray: (array: DetectorArray | null) => void;
  setInvestigationMode: (mode: InvestigationMode) => void;
  setObservations: (obs: Observation[]) => void;
  selectObsA: (obs: Observation | null) => void;
  selectObsB: (obs: Observation | null) => void;
  setActiveCandidate: (cand: Candidate | null) => void;
  setHoveredObject: (obj: HoveredSkyObject | null) => void;
  reset: () => void;
}

export const useSkyStore = create<SkyState>((set) => ({
  ra: 83.8221, // Default Orion Nebula
  dec: -5.3911,
  fov: 0.08,
  radius: 0.04,
  selectedBand: 50,
  selectedArray: null,
  investigationMode: 'video',
  activePresetName: 'Orion Nebula (M42)',

  observations: [],
  selectedObsA: null,
  selectedObsB: null,

  activeCandidate: null,
  hoveredObject: null,

  setCoordinates: (ra, dec, presetName) =>
    set({
      ra,
      dec,
      activePresetName: presetName ?? null,
    }),

  setFov: (fov) => set({ fov, radius: fov / 2 }),
  setRadius: (radius) => set({ radius, fov: radius * 2 }),
  setSelectedBand: (selectedBand) => set({ selectedBand }),
  setSelectedArray: (selectedArray) => set({ selectedArray }),
  setInvestigationMode: (investigationMode) => set({ investigationMode }),
  setObservations: (observations) => set({ observations }),
  selectObsA: (selectedObsA) => set({ selectedObsA }),
  selectObsB: (selectedObsB) => set({ selectedObsB }),
  setActiveCandidate: (activeCandidate) => set({ activeCandidate }),
  setHoveredObject: (hoveredObject) => set({ hoveredObject }),

  reset: () =>
    set({
      observations: [],
      selectedObsA: null,
      selectedObsB: null,
      activeCandidate: null,
      hoveredObject: null,
    }),
}));
