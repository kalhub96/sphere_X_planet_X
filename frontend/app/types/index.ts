export interface Observation {
  id: string;
  ra: number;
  dec: number;
  ra_deg?: number;
  dec_deg?: number;
  band_index: number;
  wavelength_um: number;
  obs_date: string;
  epoch_mjd: number;
  exposure_s?: number;
  quality_pct: number;
  fits_url: string;
  /** True when the record came from the backend's offline demo fallback, not IRSA. */
  is_simulated?: boolean;
}

export interface WavelengthBand {
  index: number;
  wavelength_um: number;
  label: string;
  detector: string;
}

export interface WCSHeader {
  crpix1: number;
  crpix2: number;
  crval1: number;
  crval2: number;
  cd1_1: number;
  cd1_2: number;
  cd2_1: number;
  cd2_2: number;
  pixel_scale_arcsec: number;
}

export interface FlagSummary {
  clean_pct: number;
  cosmic_ray_px: number;
  saturated_px: number;
  bad_px: number;
}

export interface EpochFrame {
  epoch_index: number;
  epoch_mjd: number;
  exposure_s?: number;
  obs_date: string;
  image_b64: string;
  wcs: WCSHeader;
  flags: FlagSummary;
  band_index: number | null;
  detector_array: string | null;
  wavelength_um: number | null;
  /** True when this frame's pixels are simulated demo data, not SPHEREx data. */
  is_simulated?: boolean;
}

export type DataSource = 'live' | 'mixed' | 'simulated';

export interface CombineResult {
  ra: number;
  dec: number;
  fov: number;
  plus: number[];
  minus: number[];
  kind: 'stack' | 'difference';
  label: string;
  image_b64: string;
  data_source?: DataSource;
  is_simulated?: boolean;
}

export interface FalseColorChannel {
  channel: 'red' | 'green' | 'blue';
  array: string;
  wavelength_min_um: number;
  wavelength_max_um: number;
  n_exposures: number;
}

export interface FalseColorResult {
  ra: number;
  dec: number;
  fov: number;
  epoch_index: number;
  obs_date: string;
  image_b64: string;
  channels: FalseColorChannel[];
  data_source?: DataSource;
  is_simulated?: boolean;
}

export interface EpochsResult {
  ra: number;
  dec: number;
  fov: number;
  detector_array: string | null;
  band_index: number | null;
  stretch: string;
  epochs: EpochFrame[];
  difference_b64: string | null;
  falsecolor_b64: string | null;
  candidates?: Candidate[];
  /** "live" = all frames from the SPHEREx archive; "mixed"/"simulated" = demo data involved. */
  data_source?: DataSource;
  is_simulated?: boolean;
  /** Epochs that could not be downloaded; the frames shown are still real. */
  warnings?: string[];
}

export interface Candidate {
  id: string;
  comparison_id: string;
  ra_deg: number;
  dec_deg: number;
  ra?: number;
  dec?: number;
  pixel_x: number;
  pixel_y: number;
  confidence_score: number;
  snr_change: number;
  classification: string;
  caveats: string[];
  parallax_distance_pc?: number;
  proper_motion_mas_yr?: number;
  near_sensor_boundary?: boolean;
  boundary_distance_px?: number;
  solar_system_crossmatch?: {
    matched: boolean;
    nearest_body: string;
    nearest_type: string;
    angular_separation_arcsec: number;
    verdict: string;
    explanation: string;
  };
}

export interface ComparisonResult {
  comparison_id: string;
  obs_a_id: string;
  obs_b_id: string;
  band_index: number;
  wavelength_um: number;
  image_a_b64: string;
  image_b_b64: string;
  difference_b64: string;
  falsecolor_b64?: string;
  wcs: WCSHeader;
  candidates: Candidate[];
  metadata?: { is_simulated?: boolean; [key: string]: unknown };
}

export interface PhotometryPoint {
  band_index: number;
  wavelength_um: number;
  flux_ujy: number;
  flux_err_ujy: number;
}

export interface ModelFit {
  template_name: string;
  chi2: number;
  temperature_k?: number;
  reduced_chi2: number;
  model_fluxes: number[];
}

export interface SEDData {
  photometry: PhotometryPoint[];
  best_fit: ModelFit;
  alternative_fits: ModelFit[];
}

export interface CrossMatch {
  catalog: string;
  source_id: string;
  angular_dist_arcsec: number;
  proper_motion_mas_yr?: number;
  known_solar_system: boolean;
}

export interface Evidence {
  candidate_id: string;
  classification: string;
  confidence_score: number;
  sed?: SEDData;
  cross_matches?: CrossMatch[];
  quality_flags?: {
    clean_pct: number;
    cosmic_ray_px: number;
    saturated_px: number;
    bad_px: number;
  };
  solar_system_alert?: boolean;
  notes?: string[];
  narrative?: string;
  measurements?: any[];
  irsa_links?: string[];
}
