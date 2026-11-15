export type DetectorArray = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';

export interface BenchmarkPreset {
  name: string;
  ra: number;
  dec: number;
  fov: number;
  array: DetectorArray;
  band: number;
  description: string;
}

export const FOV_PRESETS = [0.05, 0.08, 0.15, 0.25, 0.5] as const;

/** Any field of view in this range (degrees) is accepted, not only the presets. */
export const FOV_MIN = 0.01;
export const FOV_MAX = 1.0;

export const DETECTOR_ARRAYS: ReadonlyArray<{
  id: DetectorArray;
  label: string;
  bandRange: string;
  wavelengthRange: string;
}> = [
  { id: 'D1', label: 'D1', bandRange: '1–17', wavelengthRange: '0.75–1.10 µm' },
  { id: 'D2', label: 'D2', bandRange: '18–34', wavelengthRange: '1.10–1.63 µm' },
  { id: 'D3', label: 'D3', bandRange: '35–51', wavelengthRange: '1.63–2.42 µm' },
  { id: 'D4', label: 'D4', bandRange: '52–68', wavelengthRange: '2.42–3.58 µm' },
  { id: 'D5', label: 'D5', bandRange: '69–85', wavelengthRange: '3.58–4.32 µm' },
  { id: 'D6', label: 'D6', bandRange: '86–102', wavelengthRange: '4.32–5.00 µm' },
];

export const BENCHMARK_PRESETS: readonly BenchmarkPreset[] = [
  {
    name: "Barnard's Star",
    ra: 269.4521,
    dec: 4.6934,
    fov: 0.08,
    array: 'D1',
    band: 10,
    description: 'High proper-motion red dwarf; compare epochs and the unWISE baseline.',
  },
  {
    name: 'Epsilon Indi B',
    ra: 331.0438,
    dec: -56.7828,
    fov: 0.15,
    array: 'D2',
    band: 26,
    description: 'T-dwarf binary with methane features across D2/D3.',
  },
  {
    name: 'WISE 0855',
    ra: 133.7951,
    dec: -7.2451,
    fov: 0.08,
    array: 'D6',
    band: 94,
    description: 'Ultra-cold Y dwarf; its thermal emission emerges in D5/D6.',
  },
  {
    name: 'RW Aurigae',
    ra: 76.9564,
    dec: 30.4014,
    fov: 0.05,
    array: 'D2',
    band: 26,
    description: 'Irregular variable; investigate flux changes at a fixed position.',
  },
  {
    name: 'R Draconis',
    ra: 248.1633,
    dec: 66.7539,
    fov: 0.05,
    array: 'D3',
    band: 43,
    description: 'Mira variable with long-period infrared pulsation.',
  },
];
