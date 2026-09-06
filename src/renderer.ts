// ---------------------------------------------------------------------------
// Field map renderer.
//
// Two stacked canvases:
//   1. color canvas   - rasterised colour field (magnitude or angle). Rebuilt
//                       only when dataset / palette / colour mode / transfer /
//                       zoom change.
//   2. overlay canvas - arrows, grid, axes, charges, hover readout marker.
//                       Redrawn on every pan / zoom.
//
// Coordinate model (screen <-> world):
//   world    physics coords, x east / y north (same as the data files)
//   screen   canvas device pixels, origin top-left, y points down
//   px = originX + x * scale
//   py = originY - y * scale        (north = up on screen)
//   scale    device pixels per world unit (>= 0)
// ---------------------------------------------------------------------------

import type { ColorMode, ColormapKey, FieldDataset, MagScale, PointCharge } from './types';
import { colorForTheme, isLightTheme } from './colormaps';
import { scaleMag01 } from './dataset';
import type { DatasetStats } from './dataset';

export interface ViewTransform {
  scale: number;
  originX: number;
  originY: number;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// Theme colours come from the CSS custom properties so canvas and DOM stay in
// sync when the user switches dark/light. Fallbacks match the dark theme.
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const cs = getComputedStyle(document.documentElement);
  const v = cs.getPropertyValue(name).trim();
  return v.length > 0 ? v : fallback;
}

export function canvasBackground(): string {
  return cssVar('--canvas-bg', '#11141d');
}
function gridLineColor(): string {
  return cssVar('--grid-line', 'rgba(255,255,255,0.09)');
}
function axisLineColor(): string {
  return cssVar('--axis-line', 'rgba(255,255,255,0.55)');
}

function px2worldX(px: number, v: ViewTransform): number {
  return (px - v.originX) / v.scale;
}
function px2worldY(py: number, v: ViewTransform): number {
  return (v.originY - py) / v.scale;
}

interface Viewport {
  wx0: number;
  wx1: number;
  wy0: number;
  wy1: number;
}

function viewport(v: ViewTransform, cssW: number, cssH: number): Viewport {
  return {
    wx0: px2worldX(0, v),
    wx1: px2worldX(cssW, v),
    wy0: px2worldY(cssH, v), // screen bottom = world south
    wy1: px2worldY(0, v),
  };
}

// ---------------------------------------------------------------------------
// Colour-field rasterisation.
//
// Strategy: rasterise once at a moderate cell resolution that is independent of
// the zoom, then scale the resulting small bitmap to the canvas each frame
// (imageSmoothing off gives crisp nearest-neighbour blocks). On zoom we
// re-rasterise so the cell size tracks the zoom and fields stay sharp.
// ---------------------------------------------------------------------------

export interface RasterOptions {
  colorMode: ColorMode;
  colormap: ColormapKey;
  magScale: MagScale;
}

interface GridData {
  xs: number[];
  ys: number[];
  dx: number;
  dy: number;
  nx: number;
  ny: number;
  byKey: Map<string, { u: number; v: number; valid: boolean }>;
}

/**
 * When the samples form a complete, evenly spaced lattice, return a dense
 * index over it; otherwise null. A regular grid lets us draw the field as a
 * smooth continuous background instead of one coloured block per sample.
 */
function buildRegularGrid(ds: FieldDataset): GridData | null {
  const lat = latticeOf(ds);
  if (!lat) return null;
  const { xs, ys } = lat;
  const nx = xs.length;
  const ny = ys.length;
  if (nx < 2 || ny < 2) return null;
  const dx = (xs[nx - 1] - xs[0]) / (nx - 1);
  const dy = (ys[ny - 1] - ys[0]) / (ny - 1);
  if (!(dx > 0) || !(dy > 0)) return null;
  const epsX = Math.max(1e-9, Math.abs(dx) * 1e-6);
  const epsY = Math.max(1e-9, Math.abs(dy) * 1e-6);
  for (let i = 0; i < nx; i++) if (Math.abs(xs[i] - (xs[0] + i * dx)) > epsX) return null;
  for (let j = 0; j < ny; j++) if (Math.abs(ys[j] - (ys[0] + j * dy)) > epsY) return null;

  const byKey = new Map<string, { u: number; v: number; valid: boolean }>();
  for (const region of ds.regions) {
    for (const s of region.samples) {
      const fx = (s.x - xs[0]) / dx;
      const fy = (s.y - ys[0]) / dy;
      const ix = Math.round(fx);
      const jy = Math.round(fy);
      if (Math.abs(fx - ix) > 1e-6 || Math.abs(fy - jy) > 1e-6) return null;
      if (ix < 0 || ix >= nx || jy < 0 || jy >= ny) continue;
      byKey.set(`${ix},${jy}`, { u: s.u, v: s.v, valid: s.valid });
    }
  }
  return { xs, ys, dx, dy, nx, ny, byKey };
}

/**
 * Bilinear interpolation of (u, v) at world position (wx, wy) over a regular
 * grid. Masked (invalid) or missing corners are skipped and the remaining
 * weights renormalised, so charge holes stay local without smearing. Returns
 * null outside the grid rectangle.
 */
function interpGrid(
  grid: GridData,
  wx: number,
  wy: number,
): [number, number] | null {
  const fx = (wx - grid.xs[0]) / grid.dx;
  const fy = (wy - grid.ys[0]) / grid.dy;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  if (i0 < -1 || i0 > grid.nx - 1 || j0 < -1 || j0 > grid.ny - 1) return null;

  let su = 0;
  let sv = 0;
  let sw = 0;
  for (let dj = 0; dj <= 1; dj++) {
    const jj = j0 + dj;
    if (jj < 0 || jj >= grid.ny) continue;
    for (let di = 0; di <= 1; di++) {
      const ii = i0 + di;
      if (ii < 0 || ii >= grid.nx) continue;
      const s = grid.byKey.get(`${ii},${jj}`);
      if (!s || !s.valid) continue;
      const w = (1 - Math.abs(fx - ii)) * (1 - Math.abs(fy - jj));
      if (w <= 0) continue;
      su += s.u * w;
      sv += s.v * w;
      sw += w;
    }
  }
  if (sw <= 0) return null;
  return [su / sw, sv / sw];
}

/**
 * Paint the colour field into a canvas sized cssW x cssH (device px) for the
 * current view. `cellTarget` is the desired on-screen cell size in device px.
 *
 * Regular grids are drawn as a smooth, continuous background (bilinear
 * interpolation of the field values); irregular point sets fall back to the
 * blocky nearest-sample cells.
 */
export function paintColorField(
  canvas: HTMLCanvasElement,
  ds: FieldDataset,
  stats: DatasetStats,
  opts: RasterOptions,
  view: ViewTransform,
  cellTarget = 10,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  const regions = ds.regions.filter((r) => r.samples.length > 0);

  // Background for empty area.
  ctx.fillStyle = canvasBackground();
  ctx.fillRect(0, 0, W, H);

  if (regions.length === 0 || stats.validCount === 0) return;

  const grid = buildRegularGrid(ds);

  // ------------------------------------------------------------------
  // Smooth path: continuous background from a regular lattice.
  // ------------------------------------------------------------------
  if (grid) {
    const ncx = Math.max(1, Math.min(1600, Math.ceil(W / cellTarget)));
    const ncy = Math.max(1, Math.min(1600, Math.ceil(H / cellTarget)));
    const img = ctx.createImageData(ncx, ncy);
    const maxMag = stats.maxMag || 1;

    for (let cy = 0; cy < ncy; cy++) {
      // sample at the CENTRE of each cell for a stable gradient
      const py = (cy + 0.5) * (H / ncy);
      const wy = (view.originY - py) / view.scale;
      for (let cx = 0; cx < ncx; cx++) {
        const px = (cx + 0.5) * (W / ncx);
        const wx = (px - view.originX) / view.scale;
        const f = interpGrid(grid, wx, wy);
        const o = (cy * ncx + cx) * 4;
        if (!f) {
          img.data[o + 3] = 0;
          continue;
        }
        const [u, v] = f;
        const mag = Math.hypot(u, v);
        let rgb: [number, number, number];
        if (opts.colorMode === 'angle') {
          const deg = (Math.atan2(v, u) * 180) / Math.PI;
          rgb = hslToRgb(deg);
        } else {
          const t = scaleMag01(mag, maxMag, opts.magScale);
          rgb = colorForTheme(opts.colormap, clamp01(t));
        }
        img.data[o] = rgb[0];
        img.data[o + 1] = rgb[1];
        img.data[o + 2] = rgb[2];
        img.data[o + 3] = 255;
      }
    }

    const tmp = document.createElement('canvas');
    tmp.width = ncx;
    tmp.height = ncy;
    const tctx = tmp.getContext('2d');
    if (!tctx) return;
    tctx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = canvasBackground();
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmp, 0, 0, ncx, ncy, 0, 0, W, H);
    return;
  }

  // ------------------------------------------------------------------
  // Fallback: irregular point set -> blocky nearest-sample cells.
  // ------------------------------------------------------------------

  // We work in a low-res buffer, one colour cell per target screen cell.
  // Cells outside the sample bounding box stay transparent (show background).
  const ncx = Math.max(1, Math.min(2048, Math.ceil(W / cellTarget)));
  const ncy = Math.max(1, Math.min(2048, Math.ceil(H / cellTarget)));
  const cellW = W / ncx;
  const cellH = H / ncy;

  const accSum = new Float64Array(ncx * ncy); // accumulated rel. magnitude
  const accSx = new Float64Array(ncx * ncy); // sum u
  const accSy = new Float64Array(ncx * ncy); // sum v
  const accN = new Int32Array(ncx * ncy);

  const maxMag = stats.maxMag || 1;

  for (const region of regions) {
    for (const s of region.samples) {
      if (!s.valid) continue;
      const px = view.originX + s.x * view.scale;
      const py = view.originY - s.y * view.scale;
      const cx = Math.floor(px / cellW);
      const cy = Math.floor(py / cellH);
      if (cx < 0 || cx >= ncx || cy < 0 || cy >= ncy) continue;
      const i = cy * ncx + cx;
      accSum[i] += Math.hypot(s.u, s.v) / maxMag;
      accSx[i] += s.u;
      accSy[i] += s.v;
      accN[i]++;
    }
  }
  const img = ctx.createImageData(ncx, ncy);
  for (let i = 0; i < ncx * ncy; i++) {
    const n = accN[i];
    if (n === 0) {
      img.data[i * 4 + 3] = 0;
      continue;
    }
    const avgT = accSum[i] / n;
    const u = accSx[i] / n;
    const v = accSy[i] / n;
    let rgb: [number, number, number];
    if (opts.colorMode === 'angle') {
      const deg = (Math.atan2(v, u) * 180) / Math.PI;
      rgb = hslToRgb(deg);
    } else {
      const t = scaleMag01(avgT * maxMag, maxMag, opts.magScale);
      rgb = colorForTheme(opts.colormap, clamp01(t));
    }
    const o = i * 4;
    img.data[o] = rgb[0];
    img.data[o + 1] = rgb[1];
    img.data[o + 2] = rgb[2];
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Scale the low-res bitmap up to the full canvas.
  const tmp = document.createElement('canvas');
  tmp.width = ncx;
  tmp.height = ncy;
  const tctx = tmp.getContext('2d');
  if (!tctx) return;
  tctx.putImageData(img, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = canvasBackground();
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, ncx, ncy, 0, 0, W, H);
}

/** Convert an angle in degrees to a saturated HSL-based rgb (direction colour). */
function hslToRgb(deg: number): [number, number, number] {
  const h = ((deg % 360) + 360) % 360;
  const s = 0.9;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// ---------------------------------------------------------------------------
// Overlay: arrows, grid, axes, charges.
// ---------------------------------------------------------------------------

export interface OverlayOptions {
  grid: boolean;
  axes: boolean;
  charges: boolean;
  arrows: boolean;
  arrowEvery: number; // lattice decimation: 1 = all samples
  colorMode: ColorMode;
  colormap: ColormapKey;
  magScale: MagScale;
}

export interface SampleLattice {
  xs: number[];
  ys: number[];
  dx: number;
  dy: number;
}

function latticeOf(ds: FieldDataset): SampleLattice | null {
  const region = ds.regions.find((r) => r.samples.length > 0);
  if (!region) return null;
  const xSet = new Set<number>();
  const ySet = new Set<number>();
  for (const s of region.samples) {
    if (!s.valid) continue;
    xSet.add(s.x);
    ySet.add(s.y);
  }
  const xs = [...xSet].sort((a, b) => a - b);
  const ys = [...ySet].sort((a, b) => a - b);
  if (xs.length < 2 || ys.length < 2) return null;
  const med = (arr: number[]): number => {
    const d: number[] = [];
    for (let i = 1; i < arr.length; i++) d.push(arr[i] - arr[i - 1]);
    d.sort((a, b) => a - b);
    return d[d.length >> 1];
  };
  return { xs, ys, dx: med(xs), dy: med(ys) };
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  ds: FieldDataset,
  stats: DatasetStats,
  opts: OverlayOptions,
  view: ViewTransform,
  charges: PointCharge[],
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);

  drawGridAndAxes(ctx, opts, view, W, H);
  if (opts.arrows) drawArrows(ctx, ds, stats, opts, view);
  if (opts.charges && charges.length) drawChargeMarkers(ctx, charges, view);
}

function drawGridAndAxes(
  ctx: CanvasRenderingContext2D,
  opts: OverlayOptions,
  view: ViewTransform,
  W: number,
  H: number,
): void {
  if (opts.grid) {
    ctx.strokeStyle = gridLineColor();
    ctx.lineWidth = 1;
    const step = niceStep(70 / view.scale);
    const vp = viewport(view, W, H);
    ctx.beginPath();
    for (let gx = Math.ceil(vp.wx0 / step) * step; gx <= vp.wx1; gx += step) {
      const px = Math.round(view.originX + gx * view.scale) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
    }
    for (let gy = Math.ceil(vp.wy0 / step) * step; gy <= vp.wy1; gy += step) {
      const py = Math.round(view.originY - gy * view.scale) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
    }
    ctx.stroke();
  }
  if (opts.axes) {
    ctx.strokeStyle = axisLineColor();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const ay = Math.round(view.originY) + 0.5;
    const ax = Math.round(view.originX) + 0.5;
    if (ay >= 0 && ay <= H) {
      ctx.moveTo(0, ay);
      ctx.lineTo(W, ay);
    }
    if (ax >= 0 && ax <= W) {
      ctx.moveTo(ax, 0);
      ctx.lineTo(ax, H);
    }
    ctx.stroke();
  }
}

function niceStep(raw: number): number {
  if (!isFinite(raw) || raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return step * mag;
}

function drawArrows(
  ctx: CanvasRenderingContext2D,
  ds: FieldDataset,
  stats: DatasetStats,
  opts: OverlayOptions,
  view: ViewTransform,
): void {
  const lat = latticeOf(ds);
  if (!lat) return;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // skip = decimation based on pixel density and lattice spacing
  const pxPerSampleX = lat.dx * view.scale;
  const pxPerSampleY = lat.dy * view.scale;
  const targetArrowPx = 32; // desired spacing between arrows on screen
  const kx = Math.max(1, Math.round(targetArrowPx / Math.max(1, pxPerSampleX)));
  const ky = Math.max(1, Math.round(targetArrowPx / Math.max(1, pxPerSampleY)));
  const stepX = Math.max(1, Math.round(opts.arrowEvery * kx));
  const stepY = Math.max(1, Math.round(opts.arrowEvery * ky));

  const maxMag = stats.maxMag || 1;

  const region = ds.regions.find((r) => r.samples.length > 0);
  if (!region) return;
  // Build index mapping each (xIdx, yIdx) to its sample (assume grid-complete).
  const byRow = new Map<number, Map<number, number>>(); // yIdx -> xIdx -> sample idx
  const xIdxMap = new Map<number, number>();
  const yIdxMap = new Map<number, number>();
  lat.xs.forEach((x, i) => xIdxMap.set(x, i));
  lat.ys.forEach((y, i) => yIdxMap.set(y, i));
  region.samples.forEach((s, si) => {
    if (!s.valid) return;
    const xi = xIdxMap.get(s.x);
    const yi = yIdxMap.get(s.y);
    if (xi === undefined || yi === undefined) return;
    let row = byRow.get(yi);
    if (!row) {
      row = new Map();
      byRow.set(yi, row);
    }
    row.set(xi, si);
  });

  for (let yi = 0; yi < lat.ys.length; yi += stepY) {
    const row = byRow.get(yi);
    if (!row) continue;
    for (let xi = 0; xi < lat.xs.length; xi += stepX) {
      const si = row.get(xi);
      if (si === undefined) continue;
      const s = region.samples[si];
      const px = view.originX + s.x * view.scale;
      const py = view.originY - s.y * view.scale;
      if (px < -30 || px > W + 30 || py < -30 || py > H + 30) continue;
      const mag = Math.hypot(s.u, s.v);
      const t01 = scaleMag01(mag, maxMag, opts.magScale);
      const len = 3 + 15 * clamp01(t01);
      const ang = Math.atan2(s.v, s.u);
      const dx = Math.cos(ang) * len;
      const dy = -Math.sin(ang) * len;
      // Reference style: thin "ink" arrows over the heatmap. Direction mode
      // keeps the cyclic hue; magnitude mode uses a single ink colour so the
      // vectors read as flow lines over the coloured field, not palette blobs.
      const color =
        opts.colorMode === 'angle'
          ? `hsl(${((((ang * 180) / Math.PI) % 360) + 360) % 360}, 95%, 45%)`
          : arrowInkColor(opts.colormap);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
      // arrow head
      const hx = px + dx;
      const hy = py + dy;
      const dirBack = Math.atan2(-dy, -dx); // pointing back toward tail
      const ah = 3.4;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(
        hx + ah * Math.cos(dirBack - 0.45),
        hy + ah * Math.sin(dirBack - 0.45),
      );
      ctx.lineTo(
        hx + ah * Math.cos(dirBack + 0.45),
        hy + ah * Math.sin(dirBack + 0.45),
      );
      ctx.closePath();
      ctx.fill();
    }
  }
}

/**
 * Ink colour for magnitude-mode arrows.
 *
 * The `heat` map is a bright yellow->orange->red ramp, so in dark mode its
 * arrows must be black to stay visible. The other scientific palettes are
 * dark-bodied on a dark canvas, so they keep light arrows in dark mode.
 * Light mode always uses dark ink (soft black), matching the reference look.
 */
function arrowInkColor(colormap: ColormapKey): string {
  if (isLightTheme()) return 'rgba(20, 24, 36, 0.85)';
  if (colormap === 'heat') return 'rgba(0, 0, 0, 0.9)';
  return 'rgba(238, 242, 250, 0.92)';
}

function drawChargeMarkers(
  ctx: CanvasRenderingContext2D,
  charges: PointCharge[],
  view: ViewTransform,
): void {
  for (const c of charges) {
    const px = view.originX + c.x * view.scale;
    const py = view.originY - c.y * view.scale;
    if (px < -30 || px > ctx.canvas.width + 30 || py < -30 || py > ctx.canvas.height + 30)
      continue;
    const r = 11;
    const pos = c.q >= 0;
    const g = ctx.createRadialGradient(px, py, 1, px, py, r);
    if (pos) {
      g.addColorStop(0, '#ff8a80');
      g.addColorStop(1, '#b71c1c');
    } else {
      g.addColorStop(0, '#80d8ff');
      g.addColorStop(1, '#0d47a1');
    }
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pos ? '+' : '\u2212', px, py + 0.5);
  }
}

export interface SampleIndex {
  x: number;
  y: number;
  u: number;
  v: number;
  mag: number;
  deg: number;
}

/**
 * Nearest-sample lookup for the mouse readout. O(n) is fine for these grids.
 */
export function nearestSample(ds: FieldDataset, wx: number, wy: number): SampleIndex | null {
  let best: SampleIndex | null = null;
  let bestD = Infinity;
  for (const region of ds.regions) {
    for (const s of region.samples) {
      if (!s.valid) continue;
      const d = (s.x - wx) * (s.x - wx) + (s.y - wy) * (s.y - wy);
      if (d < bestD) {
        bestD = d;
        best = {
          x: s.x,
          y: s.y,
          u: s.u,
          v: s.v,
          mag: Math.hypot(s.u, s.v),
          deg: (Math.atan2(s.v, s.u) * 180) / Math.PI,
        };
      }
    }
  }
  return best;
}
