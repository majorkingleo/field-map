// ---------------------------------------------------------------------------
// Text parser for uploaded field data.
//
// Two table formats are supported (see DATA-FORMAT.md):
//
//   Form 1  cartesian columns     x  y  u  v
//   Form 2  polar columns         x  y  mag  deg
//
//   u, v = field components (u east, v north)
//   mag  = magnitude
//   deg  = direction in degrees, atan2(v,u) convention
//          180 / -180  -> west (horizontal), +90 / -90 -> vertical
//
//   - an optional first header row names the columns
//   - lines starting with # or ; are comments
//   - blank lines are ignored
//   - a magnitude of -999.0 (or <= -999) marks a masked / singular point
//
// Example:
//   # E-field, two negative point charges
//   x  y  mag  deg
//   10  10  0.011  -135
//   ...
// ---------------------------------------------------------------------------

import type { FieldDataset, FieldType, Region, VectorSample } from './types';

function cleanLine(line: string): string {
  return line.split('#')[0].trim();
}

function asComment(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('#') || t.startsWith(';');
}

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParseResult {
  dataset: FieldDataset;
  issues: ParseIssue[];
}

function parseNumbers(row: string): number[] {
  // Accept commas as decimal separator (European files) when the file uses them.
  const out: number[] = [];
  for (const tok of row.split(/\s+/)) {
    if (tok.length === 0) continue;
    const clean = tok.replace(/,/g, '.');
    const n = Number(clean);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const MASK = -999;

function detectPolar(headerRow: string): boolean {
  const h = headerRow.toLowerCase();
  const words = h.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 4) return false;
  const set = new Set(words);
  return set.has('deg') || set.has('angle') || set.has('winkel');
}

/**
 * Parse text in the documented table format into a FieldDataset with a single
 * region. Errors in single lines are reported but do not abort the parse.
 */
export function parseFieldFile(
  text: string,
  title: string,
  fieldType: FieldType,
  unit: string,
): ParseResult {
  const issues: ParseIssue[] = [];
  const samples: VectorSample[] = [];
  const rawLines = text.split(/\r?\n/);

  const firstData: { x: number; y: number; a: number; b: number }[] = [];
  let polar = false;
  let headerSeen = false;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const line = cleanLine(raw);
    if (line.length === 0 || asComment(line)) continue;

    const nums = parseNumbers(line);
    if (nums.length === 0) continue;

    if (!headerSeen) {
      const firstTok = (line.split(/\s+/).find((t) => t.length > 0) ?? '').replace(/,/g, '.');
      const firstIsNumber = Number.isFinite(Number(firstTok));
      if (!firstIsNumber && nums.length >= 2) {
        polar = detectPolar(line);
        headerSeen = true;
        continue;
      }
      headerSeen = true; // no header line; treat this as data
    }

    if (nums.length < 4) {
      issues.push({ line: i + 1, message: 'Line has fewer than 4 columns, skipped.' });
      continue;
    }
    const [x, y, a, b] = nums;
    if (nums.length > 4) {
      issues.push({
        line: i + 1,
        message: `Line has ${nums.length} columns; first 4 used.`,
      });
    }
    firstData.push({ x, y, a, b });
  }

  // Interpret columns: either cartesian (a=u, b=v) or polar (a=mag, b=deg).
  for (const c of firstData) {
    let u: number;
    let v: number;
    let valid = true;
    if (polar) {
      if (c.a <= MASK) {
        valid = false;
        u = 0;
        v = 0;
      } else {
        const rad = (c.b * Math.PI) / 180;
        u = c.a * Math.cos(rad);
        v = c.a * Math.sin(rad);
      }
    } else {
      u = c.a;
      v = c.b;
      if (c.a <= MASK || c.b <= MASK) {
        valid = false;
        u = 0;
        v = 0;
      }
    }
    samples.push({ x: c.x, y: c.y, u, v, valid });
  }

  const region: Region = { name: 'main', samples };
  return {
    dataset: { title, fieldType, unit, charges: [], regions: [region] },
    issues,
  };
}
