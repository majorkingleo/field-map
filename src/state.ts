// ---------------------------------------------------------------------------
// App state: canvas pan/zoom view, loaded dataset, rendering options.
// Pure functions over plain state so the UI layer can be a thin controller.
// ---------------------------------------------------------------------------

import type { ColorMode, ColormapKey, FieldDataset, MagScale } from './types';
import { computeStats } from './dataset';
import type { DatasetStats } from './dataset';

export interface ViewSettings {
  scale: number;
  originX: number;
  originY: number;
}

export interface AppOptions {
  fieldType: 'electric' | 'magnetic';
  unit: string;
  colorMode: ColorMode;
  colormap: ColormapKey;
  magScale: MagScale;
  showGrid: boolean;
  showAxes: boolean;
  showCharges: boolean;
  showArrows: boolean;
  /** Arrow length multiplier (slider in the View panel). 1 = default. */
  arrowScale: number;
}

export interface AppState {
  dataset: FieldDataset | null;
  stats: DatasetStats | null;
  view: ViewSettings;
  options: AppOptions;
}

export function defaultView(): ViewSettings {
  return { scale: 1, originX: 0, originY: 0 };
}

export function createState(): AppState {
  return {
    dataset: null,
    stats: null,
    view: defaultView(),
    options: {
      fieldType: 'electric',
      unit: 'V/m',
      colorMode: 'magnitude',
      colormap: 'heat',
      magScale: 'linear',
      showGrid: true,
      showAxes: true,
      showCharges: true,
      showArrows: true,
      arrowScale: 1,
    },
  };
}

/**
 * Fit the view so all valid samples (plus margin) are visible.
 */
export function fitToDataset(state: AppState, cssW: number, cssH: number): void {
  const ds = state.dataset;
  const stats = state.stats;
  if (!ds || !stats) return;
  const padX = stats.xmax === stats.xmin ? 0.5 : 0;
  const padY = stats.ymax === stats.ymin ? 0.5 : 0;
  const x0 = stats.xmin - padX;
  const x1 = stats.xmax + padX;
  const y0 = stats.ymin - padY;
  const y1 = stats.ymax + padY;
  const spanX = Math.max(1e-9, x1 - x0);
  const spanY = Math.max(1e-9, y1 - y0);
  const margin = 0.06;
  const scale = Math.min(
    (cssW * (1 - 2 * margin)) / spanX,
    (cssH * (1 - 2 * margin)) / spanY,
  );
  const cw = (x0 + x1) / 2;
  const ch = (y0 + y1) / 2;
  state.view = {
    scale,
    originX: cssW / 2 - cw * scale,
    originY: cssH / 2 + ch * scale,
  };
}

/**
 * Zoom by factor `f` (>1 = in) keeping the world point under screen point
 * (fx, fy) fixed.
 */
export function zoomAt(
  view: ViewSettings,
  f: number,
  fx: number,
  fy: number,
  minScale: number,
  maxScale: number,
): ViewSettings {
  const ns = Math.min(maxScale, Math.max(minScale, view.scale * f));
  if (ns === view.scale) return view;
  // world coords of the anchor
  const wx = (fx - view.originX) / view.scale;
  const wy = (view.originY - fy) / view.scale;
  return {
    scale: ns,
    originX: fx - wx * ns,
    originY: fy + wy * ns,
  };
}

/** Keep the same scale but shift by (dx, dy) screen pixels (world follows mouse drag). */
export function panBy(view: ViewSettings, dx: number, dy: number): ViewSettings {
  return { scale: view.scale, originX: view.originX + dx, originY: view.originY + dy };
}

export function replaceDataset(
  state: AppState,
  ds: FieldDataset,
  cssW: number,
  cssH: number,
): void {
  state.dataset = ds;
  state.stats = computeStats(ds);
  if (ds.regions.some((r) => r.samples.length > 0)) {
    fitToDataset(state, cssW, cssH);
  }
}

export function updateOptions(state: AppState, patch: Partial<AppOptions>): void {
  state.options = { ...state.options, ...patch };
}

export function patchView(state: AppState, patch: Partial<ViewSettings>): void {
  state.view = { ...state.view, ...patch };
}

export function cloneStateForRedraw(s: AppState): AppState {
  return {
    dataset: s.dataset,
    stats: s.stats,
    view: { ...s.view },
    options: { ...s.options },
  };
}
