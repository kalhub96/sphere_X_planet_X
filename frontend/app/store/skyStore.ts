import { create } from 'zustand';
import { Observation, Candidate } from '../types';
import type { DetectorArray } from '../config/benchmarks';

export type InvestigationMode = 'video' | 'blink' | 'slider' | 'difference' | 'combine' | 'false_color';

export type CombineRole = 'plus' | 'minus' | 'off';

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
  /**
   * Demo mode: the user explicitly asked for a scripted, simulated sky.
   * Off by default; real SPHEREx data is never replaced by simulated data otherwise.
   */
  simulate: boolean;
  /** Survey epochs (1-based) added / subtracted in the Add / subtract view. */
  combinePlus: number[];
  combineMinus: number[];

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
  setSelectedArray: (array: DetectorArray | null) => void;
  setInvestigationMode: (mode: InvestigationMode) => void;
  setSelectedBand: (band: number) => void;
  setSimulate: (simulate: boolean) => void;
  setCombine: (plus: number[], minus: number[]) => void;
  setCombineRole: (epoch: number, role: CombineRole) => void;
  setObservations: (obs: Observation[]) => void;
  selectObsA: (obs: Observation | null) => void;
  selectObsB: (obs: Observation | null) => void;
  setActiveCandidate: (cand: Candidate | null) => void;
  setHoveredObject: (obj: HoveredSkyObject | null) => void;
  reset: () => void;
}

export const useSkyStore = create<SkyState>((set) => ({
  ra: 133.7951, // Default WISE 0855 benchmark target
  dec: -7.2451,
  fov: 0.08,
  radius: 0.04,
  selectedBand: 94,
  selectedArray: 'D6',
  investigationMode: 'video',
  activePresetName: 'WISE 0855',
  simulate: false,
  combinePlus: [],
  combineMinus: [],

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
  setSelectedArray: (selectedArray) => set({ selectedArray }),
  setInvestigationMode: (investigationMode) => set({ investigationMode }),
  setSelectedBand: (selectedBand) => set({ selectedBand }),
  setSimulate: (simulate) => set({ simulate }),
  setCombine: (combinePlus, combineMinus) => set({ combinePlus, combineMinus }),
  setCombineRole: (epoch, role) =>
    set((state) => {
      const plus = state.combinePlus.filter((n) => n !== epoch);
      const minus = state.combineMinus.filter((n) => n !== epoch);
      if (role === 'plus') plus.push(epoch);
      if (role === 'minus') minus.push(epoch);
      return { combinePlus: plus.sort((a, b) => a - b), combineMinus: minus.sort((a, b) => a - b) };
    }),
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