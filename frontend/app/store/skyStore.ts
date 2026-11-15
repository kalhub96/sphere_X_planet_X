import { create } from 'zustand';
import { Observation, Candidate } from '../types';
import type { PlanetXSceneData } from '../lib/planetXScale';
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

  // 3D Celestial Sphere Display Toggles
  showEquatorialGrid: boolean;
  showEclipticGrid: boolean;
  showGalacticPlane: boolean;
  showOrrery: boolean;
  showScanPath: boolean;
  showStarLabels: boolean;
  autoRotate: boolean;

  // View Mode: Sky Survey vs Spacecraft Observation Geometry
  viewMode: 'sky' | 'spacecraft';
  showSunExclusion: boolean;
  showBoresight: boolean;
  show3DImageRelief: boolean;
  showObservationVolume: boolean;
  showTeardown: boolean;

  // Hypothetical Planet X direction and 3D orbit on the sky / orrery
  planetXMarker: { ra: number; dec: number; name: string } | null;
  setPlanetXMarker: (m: { ra: number; dec: number; name: string } | null) => void;
  // Planet X orbit + planets (log-scaled comparison drawn in the 3D view)
  planetXScene: PlanetXSceneData | null;
  setPlanetXScene: (d: PlanetXSceneData | null) => void;
  planetXOrbitPath: [number, number, number][] | null;
  setPlanetXOrbitPath: (p: [number, number, number][] | null) => void;

  // Actions
  setViewMode: (mode: 'sky' | 'spacecraft') => void;
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
  toggleSetting: (
    key:
      | 'showEquatorialGrid'
      | 'showEclipticGrid'
      | 'showGalacticPlane'
      | 'showOrrery'
      | 'showScanPath'
      | 'showStarLabels'
      | 'autoRotate'
      | 'showSunExclusion'
      | 'showBoresight'
      | 'show3DImageRelief'
      | 'showObservationVolume'
      | 'showTeardown'
  ) => void;
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
  simulate: false,
  combinePlus: [],
  combineMinus: [],

  observations: [],
  selectedObsA: null,
  selectedObsB: null,

  activeCandidate: null,
  hoveredObject: null,

  showEquatorialGrid: true,
  showEclipticGrid: true,
  showGalacticPlane: true,
  showOrrery: true,
  showScanPath: true,
  showStarLabels: true,
  autoRotate: true,

  viewMode: 'sky',
  showSunExclusion: true,
  showBoresight: true,
  show3DImageRelief: true,
  showObservationVolume: true,
  showTeardown: false,

  planetXMarker: null,
  setPlanetXMarker: (planetXMarker) => set({ planetXMarker }),
  planetXScene: null,
  setPlanetXScene: (planetXScene) => set({ planetXScene }),
  planetXOrbitPath: null,
  setPlanetXOrbitPath: (planetXOrbitPath) => set({ planetXOrbitPath }),

  setViewMode: (viewMode) => set({ viewMode }),

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

  toggleSetting: (key) =>
    set((state) => ({
      [key]: !state[key],
    })),

  reset: () =>
    set({
      observations: [],
      selectedObsA: null,
      selectedObsB: null,
      activeCandidate: null,
      hoveredObject: null,
    }),
}));