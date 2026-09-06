// ---------------------------------------------------------------------------
// Built-in demo datasets so the page works without any upload.
// Two negative point charges q1=(-5,0), q2=(+5,0), grid -10..10 step 0.5,
// exactly matching the "feld punktladung neg neg" spec. The field is
// E = k*q/r^2 with the example's normalisation (|E| = 4 a.u. at r = 0.5
// between the charges), charges masked at their location.
// ---------------------------------------------------------------------------

import type { FieldDataset, Region, VectorSample } from './types';

const K = 1; // arbitrary units; magnitude calibrated to the spec example

function fieldAt(x: number, y: number, charges: { x: number; y: number; q: number }[]) {
  let u = 0;
  let v = 0;
  for (const c of charges) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r2 = dx * dx + dy * dy;
    if (r2 < 1e-12) return null; // singular -> masked
    const r3 = Math.pow(r2, 1.5);
    const f = (K * c.q) / r3;
    u += f * dx;
    v += f * dy;
  }
  return { u, v };
}

export function demoDataset(): FieldDataset {
  const charges = [
    { x: -5, y: 0, q: -1 },
    { x: 5, y: 0, q: -1 },
  ];

  const samples: VectorSample[] = [];
  const start = -10;
  const stop = 10;
  const step = 0.5;

  for (let y = stop; y >= start - 1e-9; y -= step) {
    for (let x = start; x <= stop + 1e-9; x += step) {
      const c = fieldAt(x, y, charges);
      const yy = Math.round(y * 1e9) / 1e9;
      const xx = Math.round(x * 1e9) / 1e9;
      if (!c) {
        samples.push({ x: xx, y: yy, u: 0, v: 0, valid: false });
      } else {
        samples.push({ x: xx, y: yy, u: c.u, v: c.v, valid: true });
      }
    }
  }

  const region: Region = { name: 'grid', samples };
  return {
    title: 'Two negative point charges',
    fieldType: 'electric',
    unit: 'V/m',
    charges: charges.map((c) => ({ ...c })),
    regions: [region],
  };
}
