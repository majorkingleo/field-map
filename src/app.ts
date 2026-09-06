// ---------------------------------------------------------------------------
// Controller: owns the DOM, canvases, pointer input, and re-render scheduling.
// ---------------------------------------------------------------------------

import { computeStats } from './dataset';
import { paintColorField, drawOverlay, nearestSample, canvasBackground } from './renderer';
import { createState, zoomAt, panBy, replaceDataset, updateOptions } from './state';
import type { AppOptions } from './state';
import type { ViewTransform } from './renderer';
import type { FieldDataset, PointCharge } from './types';

const MIN_SCALE = 1e-6;
const MAX_SCALE = 1e9;

export class FieldMapController {
  private state = createState();
  private colorCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private colorCtx: CanvasRenderingContext2D | null;
  private overlayCtx: CanvasRenderingContext2D | null;
  private wrap: HTMLElement;
  private raf = 0;
  private colorDirty = true;

  // callbacks for UI label updates
  private onStateChange: ((s: ReturnType<typeof createState>) => void) | null = null;

  constructor(container: HTMLElement) {
    this.wrap = container;
    this.colorCanvas = container.querySelector<HTMLCanvasElement>('#colorCanvas')!;
    this.overlayCanvas = container.querySelector<HTMLCanvasElement>('#overlayCanvas')!;
    this.colorCtx = this.colorCanvas.getContext('2d');
    this.overlayCtx = this.overlayCanvas.getContext('2d');
    this.setupResize();
    this.setupInput();
  }

  setOnChange(cb: (s: ReturnType<typeof createState>) => void): void {
    this.onStateChange = cb;
  }

  getState(): ReturnType<typeof createState> {
    return this.state;
  }

  // ----- public actions ---------------------------------------------------

  loadDataset(ds: FieldDataset): void {
    replaceDataset(this.state, ds, this.colorCanvas.width, this.colorCanvas.height);
    this.colorDirty = true;
    this.requestRender();
  }

  fitView(): void {
    if (!this.state.dataset || !this.state.stats) return;
    const { width, height } = this.colorCanvas;
    replaceDataset(this.state, this.state.dataset, width, height); // re-fits
    this.colorDirty = true;
    this.requestRender();
  }

  setOptions(patch: Partial<AppOptions>): void {
    const prev = this.state.options;
    updateOptions(this.state, patch);
    if (
      patch.colorMode ||
      patch.colormap ||
      patch.magScale ||
      patch.fieldType ||
      patch.unit !== undefined
    ) {
      // colour raster depends on these
      this.colorDirty = true;
    }
    if (patch.unit !== undefined && this.state.dataset) {
      this.state.dataset.unit = patch.unit;
    }
    void prev;
    this.requestRender();
  }

  // ----- lifecycle --------------------------------------------------------

  private setupResize(): void {
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.wrap);
    this.resize();
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.wrap.getBoundingClientRect();
    const w = Math.max(100, Math.round(rect.width));
    const h = Math.max(100, Math.round(rect.height));
    for (const c of [this.colorCanvas, this.overlayCanvas]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    // If we already have a dataset, re-fit after size change.
    if (this.state.dataset) this.fitView();
    else this.paintBackgroundOnly();
  }

  private paintBackgroundOnly(): void {
    if (!this.colorCtx) return;
    this.colorCtx.fillStyle = canvasBackground();
    this.colorCtx.fillRect(0, 0, this.colorCanvas.width, this.colorCanvas.height);
    this.overlayCtx?.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
  }

  /** Redraw the whole canvas stack (used after a theme switch). */
  redraw(): void {
    this.colorDirty = true;
    this.requestRender();
  }

  // ----- input ------------------------------------------------------------

  private setupInput(): void {
    const ov = this.overlayCanvas;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    ov.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.offsetX * this.dpr();
      lastY = e.offsetY * this.dpr();
      ov.setPointerCapture(e.pointerId);
    });

    ov.addEventListener('pointermove', (e) => {
      const x = e.offsetX * this.dpr();
      const y = e.offsetY * this.dpr();
      if (dragging) {
        const dx = x - lastX;
        const dy = y - lastY;
        lastX = x;
        lastY = y;
        this.state.view = panBy(this.state.view, dx, dy);
        this.colorDirty = true;
        this.requestRender();
      } else {
        this.updateHover(e.offsetX, e.offsetY);
      }
    });

    const end = (e: PointerEvent) => {
      dragging = false;
      void e;
    };
    ov.addEventListener('pointerup', end);
    ov.addEventListener('pointercancel', end);
    ov.addEventListener('pointerleave', () => this.clearHover());

    ov.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
        const fx = e.offsetX * this.dpr();
        const fy = e.offsetY * this.dpr();
        this.state.view = zoomAt(this.state.view, factor, fx, fy, MIN_SCALE, MAX_SCALE);
        this.colorDirty = true;
        this.requestRender();
      },
      { passive: false },
    );
  }

  private dpr(): number {
    return Math.min(2, window.devicePixelRatio || 1);
  }

  private updateHover(cssX: number, cssY: number): void {
    const s = this.state;
    if (!s.dataset || !s.stats) return;
    const x = cssX * this.dpr();
    const y = cssY * this.dpr();
    const v: ViewTransform = {
      scale: s.view.scale,
      originX: s.view.originX,
      originY: s.view.originY,
    };
    const wx = (x - v.originX) / v.scale;
    const wy = (v.originY - y) / v.scale;
    const hit = nearestSample(s.dataset, wx, wy);
    const el = document.getElementById('readout');
    if (!el) return;
    if (!hit) {
      el.textContent = '';
      return;
    }
    const unit = s.dataset.unit;
    el.textContent = `x=${fmt(hit.x)}  y=${fmt(hit.y)}   |E|=${fmt(hit.mag)} ${unit}  angle=${fmt(hit.deg)}\u00b0`;
    this.state = s;
  }

  private clearHover(): void {
    const el = document.getElementById('readout');
    if (el) el.textContent = '';
  }

  // ----- render -----------------------------------------------------------

  private requestRender(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  render(): void {
    const s = this.state;
    const ds = s.dataset;
    const stats = s.stats;
    const opts = s.options;
    const view: ViewTransform = {
      scale: s.view.scale,
      originX: s.view.originX,
      originY: s.view.originY,
    };

    if (ds && stats && this.colorCtx) {
      if (this.colorDirty) {
        paintColorField(
          this.colorCanvas,
          ds,
          stats,
          {
            colorMode: opts.colorMode,
            colormap: opts.colormap,
            magScale: opts.magScale,
          },
          view,
        );
        this.colorDirty = false;
      }
      if (this.overlayCtx) {
        drawOverlay(
          this.overlayCtx,
          ds,
          stats,
          {
            grid: opts.showGrid,
            axes: opts.showAxes,
            charges: opts.showCharges,
            arrows: opts.showArrows,
            arrowEvery: 1,
            colorMode: opts.colorMode,
            colormap: opts.colormap,
            magScale: opts.magScale,
          },
          view,
          chargesOf(ds),
        );
      }
    } else {
      this.paintBackgroundOnly();
    }

    this.notify();
  }

  private notify(): void {
    if (this.onStateChange) this.onStateChange(this.state);
  }

  /** Recompute stats (e.g. after unit/masking changes) - not used now but kept. */
  refreshStats(): void {
    if (this.state.dataset) {
      this.state.stats = computeStats(this.state.dataset);
      this.colorDirty = true;
      this.requestRender();
    }
  }
}

function chargesOf(ds: FieldDataset): PointCharge[] {
  return ds.charges ?? [];
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '--';
  if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(2);
  const s = Math.abs(n) >= 10 ? n.toFixed(2) : n.toFixed(3);
  return s;
}
