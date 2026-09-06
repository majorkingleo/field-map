import type { FieldDataset, MagScale, Region, VectorSample } from './types';

export interface Bounds {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface DatasetStats extends Bounds {
  maxMag: number;
  sampleCount: number;
  validCount: number;
}

export function magnitude(u: number, v: number): number {
  return Math.hypot(u, v);
}

export function computeStats(ds: FieldDataset): DatasetStats {
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  let maxMag = 0;
  let validCount = 0;
  let sampleCount = 0;

  for (const region of ds.regions) {
    for (const s of region.samples) {
      sampleCount++;
      if (!s.valid) continue;
      validCount++;
      if (s.x < xmin) xmin = s.x;
      if (s.x > xmax) xmax = s.x;
      if (s.y < ymin) ymin = s.y;
      if (s.y > ymax) ymax = s.y;
      const m = magnitude(s.u, s.v);
      if (m > maxMag) maxMag = m;
    }
  }

  if (!isFinite(xmin)) {
    xmin = -1;
    xmax = 1;
    ymin = -1;
    ymax = 1;
  }

  return { xmin, xmax, ymin, ymax, maxMag, sampleCount, validCount };
}

/**
 * Map a magnitude in [0, max] to a value in [0, 1] with a selectable
 * transfer function. Used for colouring and arrow lengths.
 */
export function scaleMag01(mag: number, max: number, scale: MagScale): number {
  if (max <= 0) return 0;
  const n = Math.max(0, Math.min(1, mag / max));
  if (scale === 'linear') return n;
  if (scale === 'sqrt') return Math.sqrt(n);
  return Math.log10(1 + 9 * n); // log: [0,1] -> [0,1]
}

/** Inverse of scaleMag01: value in [0,1] -> magnitude in [0, max]. */
export function inverseScale01(t01: number, max: number, scale: MagScale): number {
  if (max <= 0) return 0;
  const t = Math.max(0, Math.min(1, t01));
  let n: number;
  if (scale === 'linear') n = t;
  else if (scale === 'sqrt') n = t * t;
  else n = (Math.pow(10, t) - 1) / 9;
  return n * max;
}

/**
 * Merge several datasets into one. Samples from all sources are combined into
 * a single region (they are re-measured against the union of extents anyway);
 * duplicate sample positions are replaced so a later file wins on overlap.
 */
export function mergeDatasets(
  parts: FieldDataset[],
  title: string,
  fieldType: FieldDataset['fieldType'],
  unit: string,
): FieldDataset {
  const byKey = new Map<string, VectorSample>();
  const chargesByKey = new Map<string, FieldDataset['charges'][number]>();

  for (const ds of parts) {
    for (const region of ds.regions) {
      for (const s of region.samples) {
        byKey.set(`${s.x},${s.y}`, s);
      }
    }
    for (const c of ds.charges) {
      chargesByKey.set(`${c.x},${c.y}`, c);
    }
  }

  const samples: VectorSample[] = [...byKey.values()];
  const charges = [...chargesByKey.values()];
  const region: Region = { name: 'merged', samples };

  return { title, fieldType, unit, charges, regions: [region] };
}
