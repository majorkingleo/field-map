// ---------------------------------------------------------------------------
// Physics data model
//
// World coordinates: x east, y north (mathematical convention).
// Angles are in degrees with atan2(dy, dx) convention, exactly like the
// "feld punktladung" examples in specs/:
//     180 / -180  -> horizontal (pointing west)
//     +90 / -90   -> vertical
//
// A vector (u, v) stores the field components: u east, v north.
// ---------------------------------------------------------------------------

export type FieldType = 'electric' | 'magnetic';

export type ColorMode = 'magnitude' | 'angle';

export type MagScale = 'linear' | 'sqrt' | 'log';

export type ColormapKey =
  | 'viridis'
  | 'inferno'
  | 'magma'
  | 'plasma'
  | 'cividis'
  | 'coolwarm'
  | 'gray';

/** A point charge / sink used as an overlay marker (electric field). */
export interface PointCharge {
  x: number;
  y: number;
  q: number; // signed; display only, the app never computes fields from it
}

/** One measurement point with its field vector. */
export interface VectorSample {
  x: number;
  y: number;
  /** u = component east, v = component north (physical units). */
  u: number;
  v: number;
  /** false => masked point (singularity, no data). Never drawn. */
  valid: boolean;
}

/** A rectangular (or arbitrary) collection of samples. */
export interface Region {
  name: string;
  samples: VectorSample[];
}

/** One uploaded dataset: what the user pastes / loads. */
export interface FieldDataset {
  title: string;
  fieldType: FieldType;
  /** Physical unit of the magnitude, e.g. "V/m", "T", "a.u.". Label only. */
  unit: string;
  charges: PointCharge[];
  regions: Region[];
}
