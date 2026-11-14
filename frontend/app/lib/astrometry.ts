const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Converts ICRS J2000 coordinates (RA, Dec in degrees) to a 3D unit vector.
 * Coordinate convention:
 * Y is North Celestial Pole (Dec = +90°)
 * X is Vernal Equinox (RA = 0°, Dec = 0°)
 * Z is RA = 90°, Dec = 0°
 */
export function icrsToUnitVector(raDeg: number, decDeg: number, radius = 1): Vector3D {
  const raRad = raDeg * DEG2RAD;
  const decRad = decDeg * DEG2RAD;
  return {
    x: radius * Math.cos(decRad) * Math.cos(raRad),
    y: radius * Math.sin(decRad),
    z: radius * Math.cos(decRad) * Math.sin(raRad),
  };
}

/**
 * Inverse conversion: 3D point on or near sphere -> (RA, Dec in degrees)
 */
export function vectorToIcrs(vec: Vector3D): { ra: number; dec: number } {
  const r = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
  if (r === 0) return { ra: 0, dec: 0 };

  const decRad = Math.asin(Math.max(-1, Math.min(1, vec.y / r)));
  let raRad = Math.atan2(vec.z, vec.x);
  if (raRad < 0) raRad += 2 * Math.PI;

  return {
    ra: raRad * RAD2DEG,
    dec: decRad * RAD2DEG,
  };
}

/**
 * Converts Equatorial (RA, Dec) to Galactic coordinates (l, b in degrees)
 * IAU 1958 standard definition:
 * North Galactic Pole: RA = 192.85948°, Dec = 27.12825°
 * Galactic Center: l0 = 32.93192°
 */
export function equatorialToGalactic(raDeg: number, decDeg: number): { l: number; b: number } {
  const alphaG = 192.85948 * DEG2RAD;
  const deltaG = 27.12825 * DEG2RAD;
  const l0 = 122.93192 * DEG2RAD; // Galactic longitude of North Celestial Pole

  const alpha = raDeg * DEG2RAD;
  const delta = decDeg * DEG2RAD;

  const sinB = Math.sin(delta) * Math.sin(deltaG) + Math.cos(delta) * Math.cos(deltaG) * Math.cos(alpha - alphaG);
  const b = Math.asin(Math.max(-1, Math.min(1, sinB)));

  const y = Math.cos(delta) * Math.sin(alpha - alphaG);
  const x = Math.sin(delta) * Math.cos(deltaG) - Math.cos(delta) * Math.sin(deltaG) * Math.cos(alpha - alphaG);

  let l = l0 - Math.atan2(y, x);
  while (l < 0) l += 2 * Math.PI;
  while (l >= 2 * Math.PI) l -= 2 * Math.PI;

  return {
    l: l * RAD2DEG,
    b: b * RAD2DEG,
  };
}

/**
 * Converts Equatorial (RA, Dec) to Ecliptic coordinates (lambda, beta in degrees)
 * Standard obliquity of ecliptic J2000 eps = 23.4392911°
 */
export function equatorialToEcliptic(raDeg: number, decDeg: number): { lambda: number; beta: number } {
  const eps = 23.4392911 * DEG2RAD;
  const alpha = raDeg * DEG2RAD;
  const delta = decDeg * DEG2RAD;

  const sinBeta = Math.sin(delta) * Math.cos(eps) - Math.cos(delta) * Math.sin(eps) * Math.sin(alpha);
  const beta = Math.asin(Math.max(-1, Math.min(1, sinBeta)));

  const y = Math.sin(delta) * Math.sin(eps) + Math.cos(delta) * Math.cos(eps) * Math.sin(alpha);
  const x = Math.cos(delta) * Math.cos(alpha);

  let lambda = Math.atan2(y, x);
  if (lambda < 0) lambda += 2 * Math.PI;

  return {
    lambda: lambda * RAD2DEG,
    beta: beta * RAD2DEG,
  };
}

/**
 * Format decimal degrees into sexagesimal RA (HH:MM:SS.ss)
 */
export function formatRA(raDeg: number): string {
  let normalized = raDeg % 360;
  if (normalized < 0) normalized += 360;
  const hoursDecimal = normalized / 15;
  const hours = Math.floor(hoursDecimal);
  const minutesDecimal = (hoursDecimal - hours) * 60;
  const minutes = Math.floor(minutesDecimal);
  const seconds = (minutesDecimal - minutes) * 60;
  return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toFixed(2).padStart(5, '0')}s`;
}

/**
 * Format decimal degrees into sexagesimal Dec (+-DD° MM' SS.s")
 */
export function formatDec(decDeg: number): string {
  const sign = decDeg >= 0 ? '+' : '-';
  const abs = Math.abs(decDeg);
  const deg = Math.floor(abs);
  const minutesDecimal = (abs - deg) * 60;
  const minutes = Math.floor(minutesDecimal);
  const seconds = (minutesDecimal - minutes) * 60;
  return `${sign}${deg.toString().padStart(2, '0')}° ${minutes.toString().padStart(2, '0')}' ${seconds.toFixed(1).padStart(4, '0')}"`;
}

/**
 * Parses Right Ascension string into decimal degrees [0, 360).
 * Supports:
 * - Decimal degrees: "133.7951", "133.7951°"
 * - Sexagesimal hours: "08h55m10.831s", "08h 55m 10.831s", "8h 55m 10.8s", "08h55m"
 * - Colon notation: "08:55:10.831", "08:55"
 * - Space notation: "08 55 10.831"
 */
export function parseRA(input: string): number | null {
  if (!input) return null;
  const str = input.trim();
  if (!str) return null;

  // 1. Check for sexagesimal hour notation with 'h'
  const hmsRegex = /^(\d+(?:\.\d+)?)\s*h(?:ours?)?(?:\s*(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?(?:\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?$/i;
  const hmsMatch = str.match(hmsRegex);
  if (hmsMatch) {
    const hours = parseFloat(hmsMatch[1]) || 0;
    const mins = parseFloat(hmsMatch[2]) || 0;
    const secs = parseFloat(hmsMatch[3]) || 0;
    let deg = (hours + mins / 60 + secs / 3600) * 15;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  // 2. Colon notation: "HH:MM:SS" or "HH:MM"
  const colonRegex = /^(\d+):(\d+)(?::(\d+(?:\.\d+)?))?$/;
  const colonMatch = str.match(colonRegex);
  if (colonMatch) {
    const hours = parseFloat(colonMatch[1]) || 0;
    const mins = parseFloat(colonMatch[2]) || 0;
    const secs = parseFloat(colonMatch[3]) || 0;
    let deg = (hours + mins / 60 + secs / 3600) * 15;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  // 3. Space-separated notation e.g. "08 55 10.831"
  const spaceRegex = /^(\d+)\s+(\d+)(?:\s+(\d+(?:\.\d+)?))?$/;
  const spaceMatch = str.match(spaceRegex);
  if (spaceMatch) {
    const hours = parseFloat(spaceMatch[1]) || 0;
    const mins = parseFloat(spaceMatch[2]) || 0;
    const secs = parseFloat(spaceMatch[3]) || 0;
    let deg = (hours + mins / 60 + secs / 3600) * 15;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  // 4. Plain decimal degrees
  const cleanDecimal = str.replace(/[°ddeg]/gi, '').trim();
  const num = parseFloat(cleanDecimal);
  if (!isNaN(num) && isFinite(num)) {
    return ((num % 360) + 360) % 360;
  }

  return null;
}

/**
 * Parses Declination string into decimal degrees [-90, +90].
 * Supports:
 * - Decimal degrees: "-7.2451", "-7.2451°", "+19.182"
 * - Sexagesimal degrees: "-7d14m42.53s", "-07d 14m 42.53s", "-7° 14' 42.53\"", "+19d18m"
 * - Colon notation: "-07:14:42.53", "+19:10:55"
 * - Space notation: "-7 14 42.53"
 */
export function parseDec(input: string): number | null {
  if (!input) return null;
  const str = input.trim();
  if (!str) return null;

  // Detect sign
  let sign = 1;
  let body = str;
  if (body.startsWith('-') || body.startsWith('−')) {
    sign = -1;
    body = body.slice(1).trim();
  } else if (body.startsWith('+')) {
    body = body.slice(1).trim();
  }

  // 1. Check for dms format: e.g. 7d14m42.53s or 7° 14' 42.53"
  if (/[°d'm"s]/i.test(body)) {
    const dmsRegex = /^(\d+(?:\.\d+)?)\s*(?:[°d]|deg)?(?:\s*(\\d+(?:\.\d+)?)\s*(?:['m]|min)?)?(?:\\s*(\\d+(?:\\.\d+)?)\\s*(?:[\"s]|sec)?)?$/i;
    const dmsMatch = body.match(dmsRegex);
    if (dmsMatch) {
      const deg = parseFloat(dmsMatch[1]) || 0;
      const mins = parseFloat(dmsMatch[2]) || 0;
      const secs = parseFloat(dmsMatch[3]) || 0;
      const val = sign * (deg + mins / 60 + secs / 3600);
      return Math.max(-90, Math.min(90, val));
    }
  }

  // 2. Colon notation: DD:MM:SS
  const colonRegex = /^(\d+):(\d+)(?::(\d+(?:\.\d+)?))?$/;
  const colonMatch = body.match(colonRegex);
  if (colonMatch) {
    const deg = parseFloat(colonMatch[1]) || 0;
    const mins = parseFloat(colonMatch[2]) || 0;
    const secs = parseFloat(colonMatch[3]) || 0;
    const val = sign * (deg + mins / 60 + secs / 3600);
    return Math.max(-90, Math.min(90, val));
  }

  // 3. Space notation: "-7 14 42.53"
  const spaceRegex = /^(\d+)\s+(\d+)(?:\s+(\d+(?:\.\d+)?))?$/;
  const spaceMatch = body.match(spaceRegex);
  if (spaceMatch) {
    const deg = parseFloat(spaceMatch[1]) || 0;
    const mins = parseFloat(spaceMatch[2]) || 0;
    const secs = parseFloat(spaceMatch[3]) || 0;
    const val = sign * (deg + mins / 60 + secs / 3600);
    return Math.max(-90, Math.min(90, val));
  }

  // 4. Plain decimal
  const cleanDecimal = body.replace(/[°ddeg]/gi, '').trim();
  const num = parseFloat(cleanDecimal);
  if (!isNaN(num) && isFinite(num)) {
    return Math.max(-90, Math.min(90, sign * num));
  }

  return null;
}

/**
 * Parses arbitrary coordinate string (single input with both RA & Dec)
 * e.g. "08h55m10.831s, -7d14m42.53s" or "133.7951 -7.2451" or "08:55:10.831 -07:14:42.53"
 */
export function parseCoordinateInput(input: string): { ra: number; dec: number } | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Split by comma if present
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',');
    if (parts.length === 2) {
      const ra = parseRA(parts[0]);
      const dec = parseDec(parts[1]);
      if (ra !== null && dec !== null) return { ra, dec };
    }
  }

  // Try splitting by space separating RA and signed Dec (+ or -)
  const decSignMatch = trimmed.match(/^(.*?)\s+([+-].*)$/);
  if (decSignMatch) {
    const ra = parseRA(decSignMatch[1]);
    const dec = parseDec(decSignMatch[2]);
    if (ra !== null && dec !== null) return { ra, dec };
  }

  // Space-delimited numbers e.g. "133.7951 -7.2451"
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 2) {
    const ra = parseRA(tokens[0]);
    const dec = parseDec(tokens[1]);
    if (ra !== null && dec !== null) return { ra, dec };
  }

  return null;
}

/**
 * SPHEREx Linear Variable Filter 102-band formula:
 * lambda_i = 0.75 * (5.0 / 0.75)^((i - 1) / 101)  for i in [1..102]
 */
export function getSPHERExWavelength(bandIndex: number): number {
  const clamped = Math.max(1, Math.min(102, Math.round(bandIndex)));
  return 0.75 * Math.pow(5.0 / 0.75, (clamped - 1) / 101);
}

/**
 * Maps SPHEREx wavelength (0.75 - 5.0 µm) to a representative false-color hexadecimal string and CSS color
 */
export function getWavelengthColor(wavelengthUm: number): { hex: number; css: string; name: string } {
  if (wavelengthUm < 1.1) {
    return { hex: 0x8a2be2, css: '#8A2BE2', name: 'Near-IR (B1)' };
  } else if (wavelengthUm < 1.8) {
    return { hex: 0x00e5ff, css: '#00E5FF', name: 'Near-IR (B2)' };
  } else if (wavelengthUm < 2.5) {
    return { hex: 0xffd166, css: '#FFD166', name: 'SWIR (B3)' };
  } else if (wavelengthUm < 3.8) {
    return { hex: 0xff6b35, css: '#FF6B35', name: 'MWIR (B4)' };
  } else {
    return { hex: 0xef476f, css: '#EF476F', name: 'Thermal-IR (B5/6)' };
  }
}

/**
 * Julian Date from JavaScript Date
 */
export function getJulianDate(date: Date = new Date()): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Kepler's equation solver for eccentric anomaly E:
 * M = E - e * sin(E)
 */
export function solveKepler(M: number, e: number, tolerance = 1e-8): number {
  let E = M;
  for (let iter = 0; iter < 100; iter++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tolerance) break;
  }
  return E;
}


/**
 * Bright Navigation & Reference Star Catalog (Hipparcos subset)
 */
export interface CatalogStar {
  name: string;
  ra: number;
  dec: number;
  mag: number;
  colorHex: number;
  spectralType: string;
}

export const BRIGHT_STARS: CatalogStar[] = [
  { name: 'Sirius', ra: 101.287, dec: -16.716, mag: -1.46, colorHex: 0xa0c4ff, spectralType: 'A1V' },
  { name: 'Canopus', ra: 95.988, dec: -52.696, mag: -0.74, colorHex: 0xfdf0d5, spectralType: 'F0II' },
  { name: 'Rigil Kentaurus', ra: 219.902, dec: -60.834, mag: -0.27, colorHex: 0xffe066, spectralType: 'G2V' },
  { name: 'Arcturus', ra: 213.915, dec: 19.182, mag: -0.05, colorHex: 0xff9e00, spectralType: 'K1.5III' },
  { name: 'Vega', ra: 279.235, dec: 38.784, mag: 0.03, colorHex: 0xc0d6df, spectralType: 'A0V' },
  { name: 'Capella', ra: 79.172, dec: 45.998, mag: 0.08, colorHex: 0xffe066, spectralType: 'G3III' },
  { name: 'Rigel', ra: 78.634, dec: -8.202, mag: 0.13, colorHex: 0x80b918, spectralType: 'B8Ia' },
  { name: 'Procyon', ra: 114.825, dec: 5.225, mag: 0.38, colorHex: 0xfdf0d5, spectralType: 'F5IV' },
  { name: 'Betelgeuse', ra: 88.793, dec: 7.407, mag: 0.5, colorHex: 0xff5400, spectralType: 'M1-2Ia' },
  { name: 'Achernar', ra: 24.429, dec: -57.237, mag: 0.46, colorHex: 0x90e0ef, spectralType: 'B6Vep' },
  { name: 'Hadar', ra: 210.956, dec: -60.373, mag: 0.61, colorHex: 0x90e0ef, spectralType: 'B1III' },
  { name: 'Altair', ra: 297.696, dec: 8.868, mag: 0.77, colorHex: 0xe8f1f2, spectralType: 'A7V' },
  { name: 'Acrux', ra: 186.649, dec: -63.099, mag: 0.76, colorHex: 0x90e0ef, spectralType: 'B0.5IV' },
  { name: 'Aldebaran', ra: 68.98, dec: 16.509, mag: 0.86, colorHex: 0xff7900, spectralType: 'K5III' },
  { name: 'Antares', ra: 247.352, dec: -26.432, mag: 1.06, colorHex: 0xff3600, spectralType: 'M1.5Iab' },
  { name: 'Spica', ra: 201.298, dec: -11.161, mag: 0.98, colorHex: 0x90e0ef, spectralType: 'B1III' },
  { name: 'Pollux', ra: 116.329, dec: 28.026, mag: 1.14, colorHex: 0xffb703, spectralType: 'K0III' },
  { name: 'Fomalhaut', ra: 344.413, dec: -29.622, mag: 1.16, colorHex: 0xe8f1f2, spectralType: 'A3V' },
  { name: 'Deneb', ra: 310.358, dec: 45.28, mag: 1.25, colorHex: 0xe8f1f2, spectralType: 'A2Ia' },
  { name: 'Mimosa', ra: 191.93, dec: -59.689, mag: 1.25, colorHex: 0x90e0ef, spectralType: 'B0.5III' },
  { name: 'Regulus', ra: 152.093, dec: 11.967, mag: 1.36, colorHex: 0x90e0ef, spectralType: 'B8IVn' },
  { name: 'Castor', ra: 113.65, dec: 31.888, mag: 1.58, colorHex: 0xe8f1f2, spectralType: 'A1V' },
  { name: 'Bellatrix', ra: 81.283, dec: 6.35, mag: 1.64, colorHex: 0x90e0ef, spectralType: 'B2III' },
  { name: 'Alnilam', ra: 84.053, dec: -1.202, mag: 1.69, colorHex: 0x90e0ef, spectralType: 'B0Ia' },
  { name: 'Alnitak', ra: 85.19, dec: -1.943, mag: 1.74, colorHex: 0x90e0ef, spectralType: 'O9.7Ib' },
  { name: 'Alioth', ra: 193.507, dec: 55.96, mag: 1.77, colorHex: 0xe8f1f2, spectralType: 'A1III' },
  { name: 'Dubhe', ra: 165.932, dec: 61.751, mag: 1.79, colorHex: 0xffb703, spectralType: 'K0III' },
  { name: 'Mirfak', ra: 51.081, dec: 49.861, mag: 1.82, colorHex: 0xfdf0d5, spectralType: 'F5Ib' },
  { name: 'Polaris', ra: 37.955, dec: 89.264, mag: 1.98, colorHex: 0xfdf0d5, spectralType: 'F7Ib' },
];

/**
 * Standard Sky Presets for Instant Exploration
 */
export const SKY_PRESETS = [
  {
    name: 'Orion Nebula (M42)',
    ra: 83.8221,
    dec: -5.3911,
    description: 'Active star-forming region rich in young stellar objects and brown dwarfs.',
    category: 'Nebula' as const,
  },
  {
    name: 'Pleiades Cluster (M45)',
    ra: 56.75,
    dec: 24.1167,
    description: 'Open star cluster with reflection nebulae and high proper-motion candidate stars.',
    category: 'Star Cluster' as const,
  },
  {
    name: 'Galactic Center (Sgr A*)',
    ra: 266.4168,
    dec: -29.0078,
    description: 'Extremely dense stellar field and supermassive black hole horizon.',
    category: 'Galactic' as const,
  },
  {
    name: 'North Ecliptic Pole (NEP)',
    ra: 270.0,
    dec: 66.56,
    description: 'SPHEREx deep survey calibration field with over 100 overlapping passes.',
    category: 'Deep Survey' as const,
  },
  {
    name: 'South Ecliptic Pole (SEP)',
    ra: 90.0,
    dec: -66.56,
    description: 'SPHEREx deep survey southern continuous viewing zone.',
    category: 'Deep Survey' as const,
  },
  {
    name: 'Andromeda Galaxy (M31)',
    ra: 10.6847,
    dec: 41.2687,
    description: 'Nearest major spiral galaxy; spatial distribution of red giant branch and IR sources.',
    category: 'Deep Survey' as const,
  },
];
