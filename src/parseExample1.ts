// ---------------------------------------------------------------------------
// Legacy parser: the two-row polar grid layout as found in the original
// email examples under specs/ ("example1.txt" and the GMX HTML mails).
//
// The file is a rectangular grid. Every horizontal line y is written as a
// PAIR of rows:
//
//     <deg> <deg> ... <deg>   winkel in grad     Zeile y : N    y= 10.0
//     <mag> <mag> ... <mag>   Feldstärke
//
//   - first comes one row of directions (degrees, atan2 convention),
//   - then one row of magnitudes |F| for the same grid line.
//
// The x positions of the columns come from a header line of the form:
//
//     x=-10.0 x=-9.5 x=-9.0 ... x= 0.0  Spalte x
//
// Optional "#" comment lines above the table describe the physics:
//
//     # q1 auf -5 0  fix   neg oder pos  999 oder -999
//     # q2 auf +5 0  fix   pos oder neg  999 oder -999
//     # q1 Ladung : neg
//     # q2 Ladung : pos
//
// A magnitude <= -999 (or the sentinels 999 / 777 / -999 in the angle row)
// marks a masked point (charge location). Such points are marked invalid and
// never drawn.
// ---------------------------------------------------------------------------

import type { FieldType, PointCharge, Region, VectorSample } from './types';
import type { ParseIssue, ParseResult } from './parser';

const MASK = -999;

function isComment(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('#') || t.startsWith(';');
}

/** Split on whitespace, tolerate European decimal commas. */
function numbers(line: string): number[] {
  const out: number[] = [];
  for (const tok of line.split(/\s+/)) {
    if (tok.length === 0) continue;
    const clean = tok.replace(/,/g, '.');
    const n = Number(clean);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

interface ChargeMeta {
  x: number;
  y: number;
  q: number;
}

/** Collect physics metadata from "#" header lines. */
function parseChargeHeader(lines: string[]): ChargeMeta[] {
  const charges: ChargeMeta[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!isComment(raw)) continue;
    const text = raw.replace(/^[#;]\s*/, '');

    // sign of charge: "# q1 Ladung : neg"  /  "# q2 Ladung : pos"
    const signMatch = text.match(/\b(q1|q2)\b.*?\bladung\s*:\s*(pos|neg)/i);
    if (signMatch) {
      const idx = signMatch[1].toLowerCase() === 'q1' ? 0 : 1;
      const sign = signMatch[2].toLowerCase() === 'pos' ? 1 : -1;
      if (!charges[idx]) charges[idx] = { x: 0, y: 0, q: sign };
      else charges[idx].q = sign;
      continue;
    }

    // position: "# q1 auf -5 0"  (or "# q2 auf +5 0")
    const posMatch = text.match(/\b(q1|q2)\b.*?\bauf\s+([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)/i);
    if (posMatch) {
      const idx = posMatch[1].toLowerCase() === 'q1' ? 0 : 1;
      const x = Number(posMatch[2]);
      const y = Number(posMatch[3]);
      if (!charges[idx]) charges[idx] = { x, y, q: -1 };
      else {
        charges[idx].x = x;
        charges[idx].y = y;
      }
      continue;
    }
  }
  return charges;
}

/** Parse the "x=-10.0 ... x= 0.0 Spalte x" header into x positions. */
function parseXHeader(line: string): number[] {
  const xs: number[] = [];
  const re = /x\s*=\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    xs.push(Number(m[1]));
  }
  return xs;
}

function parseYTrailer(line: string): number | null {
  // trailing part of the angle row:  "... winkel in grad     Zeile y :  1    y=  10.0"
  const m = line.match(/\by\s*=\s*([-+]?(?:\d+(?:\.\d+)?))/i);
  if (m) return Number(m[1]);
  return null;
}

function isAngleRow(line: string): boolean {
  return /winkel\s+in\s+grad/i.test(line);
}

function isMagRow(line: string): boolean {
  return /feldst/i.test(line);
}

function isXHeader(line: string): boolean {
  return /x\s*=\s*[-+]?\d/.test(line) && /spalte\s*x/i.test(line);
}

/**
 * Parse a file in the legacy two-row polar grid layout. Returns null when the
 * text does not look like that format at all.
 */
export function parseExample1Text(
  text: string,
  title: string,
  fieldType: FieldType,
  unit: string,
): ParseResult | null {
  const rawLines = text.split(/\r?\n/);
  const issues: ParseIssue[] = [];

  // Guard: must look like the two-row polar layout (angle row marker present).
  const probe = rawLines.some(isAngleRow) && rawLines.some(isMagRow);
  if (!probe) return null;

  // Collect metadata from the header.
  const charges = parseChargeHeader(rawLines);
  const samples: VectorSample[] = [];

  // Iterate lines. The x header announces a new block; it is followed by
  // (angle row, magnitude row) pairs.
  let xCols: number[] | null = null;
  let pendingY: number | null = null;
  let angleNums: number[] | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (isComment(line)) continue;

    // Separator / decorative dashes.
    if (/^[\s\-_=]+$/.test(trimmed) && trimmed.replace(/[\s\-_=]/g, '').length === 0) continue;

    if (isXHeader(line)) {
      xCols = parseXHeader(line);
      angleNums = null;
      pendingY = null;
      continue;
    }

    if (xCols === null) continue; // data before any x header -> ignore

    if (isAngleRow(line)) {
      // Only treat it as a fresh angle row when we are not expecting a
      // magnitude row to close the previous pair.
      if (angleNums === null) {
        angleNums = numbers(line);
        pendingY = parseYTrailer(line);
      }
      continue;
    }

    if (isMagRow(line) && angleNums !== null) {
      const magNums = numbers(line);
      const n = Math.min(xCols.length, angleNums.length, magNums.length);
      let y = pendingY;
      if (y === null) {
        // No explicit y in the trailer: derive from row counting.
        y = -(i * 0.5); // fallback; better than nothing
        issues.push({ line: i + 1, message: 'Row without y trailer; position estimated.' });
      }
      for (let c = 0; c < n; c++) {
        const x = xCols[c];
        const deg = angleNums[c];
        const mag = magNums[c];
        const masked = mag <= MASK || Math.abs(deg) >= 999 || Math.abs(mag) >= 999;
        let u = 0;
        let v = 0;
        if (!masked) {
          const rad = (deg * Math.PI) / 180;
          u = mag * Math.cos(rad);
          v = mag * Math.sin(rad);
        }
        samples.push({
          x,
          y,
          u,
          v,
          valid: !masked,
        });
      }
      angleNums = null;
      pendingY = null;
      continue;
    }

    // Any other content that does not fit the pattern is ignored silently
    // (label rows, spacing, decorative separators).
  }

  if (samples.length === 0) {
    issues.push({
      line: 1,
      message: 'Two-row polar grid: no data rows parsed.',
    });
  }

  // Only keep charges that lie inside the sampled area (avoid displaying
  // metadata for charges that refer to a different part of a larger grid).
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const s of samples) {
    if (s.x < xmin) xmin = s.x;
    if (s.x > xmax) xmax = s.x;
    if (s.y < ymin) ymin = s.y;
    if (s.y > ymax) ymax = s.y;
  }
  const within = (c: ChargeMeta): boolean =>
    Number.isFinite(c.x) &&
    Number.isFinite(c.y) &&
    c.x >= xmin - 1e-6 &&
    c.x <= xmax + 1e-6 &&
    c.y >= ymin - 1e-6 &&
    c.y <= ymax + 1e-6;

  const region: Region = { name: 'grid', samples };
  return {
    dataset: {
      title,
      fieldType,
      unit,
      charges: charges.filter(within).map((c): PointCharge => ({ x: c.x, y: c.y, q: c.q })),
      regions: [region],
    },
    issues,
  };
}
