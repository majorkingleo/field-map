import { FieldMapController } from './app';
import { demoDataset } from './demo';
import { parseFieldFile } from './parser';
import { colorAtRGB, COLORMAP_KEYS } from './colormaps';
import type { FieldType } from './types';
import './styles.css';

// ---------------------------------------------------------------------------
// UI wiring: toolbar, file upload, legend and readout.
// ---------------------------------------------------------------------------

const root = document.getElementById('app')!;
const controller = new FieldMapController(root);

// --- demo / sample button ---
document.getElementById('btnDemo')!.addEventListener('click', () => {
  controller.loadDataset(demoDataset());
  const title = document.getElementById('dataTitle');
  if (title) title.textContent = 'Two negative point charges (demo)';
  updateLegend();
});

// --- file upload ---
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const fieldTypeSel = document.getElementById('fieldType') as HTMLSelectElement;
const unitInput = document.getElementById('unitInput') as HTMLInputElement;

async function onFile(file: File): Promise<void> {
  const text = await file.text();
  const ftype = (fieldTypeSel.value as FieldType) || 'electric';
  const unit = unitInput.value.trim() || (ftype === 'electric' ? 'V/m' : 'T');
  const res = parseFieldFile(text, file.name.replace(/\.[^.]+$/, ''), ftype, unit);
  controller.loadDataset(res.dataset);
  controller.setOptions({ unit });
  const title = document.getElementById('dataTitle');
  if (title) title.textContent = res.dataset.title;
  // report issues
  const errEl = document.getElementById('issues');
  if (errEl) {
    const total = res.dataset.regions.reduce((a, r) => a + r.samples.length, 0);
    errEl.textContent =
      res.issues.length > 0
        ? `${res.issues.length} line(s) skipped: ${res.issues[0].message}`
        : total === 0
          ? 'No valid data rows found. Check DATA-FORMAT.md.'
          : '';
  }
  updateLegend();
}

document.getElementById('btnUpload')!.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void onFile(f);
});

// drag & drop onto canvas area
const dropZone = document.getElementById('canvasWrap')!;
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const f = e.dataTransfer?.files?.[0];
  if (f) void onFile(f);
});

// --- controls ---
function bindCheckbox(id: string, key: keyof import('./state').AppOptions): void {
  const el = document.getElementById(id) as HTMLInputElement;
  el.addEventListener('change', () => {
    controller.setOptions({ [key]: el.checked } as never);
  });
}
bindCheckbox('optGrid', 'showGrid');
bindCheckbox('optAxes', 'showAxes');
bindCheckbox('optCharges', 'showCharges');
bindCheckbox('optArrows', 'showArrows');

(document.getElementById('colorMode') as HTMLSelectElement).addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value;
  controller.setOptions({ colorMode: v as never });
  updateLegend();
});

(document.getElementById('colormap') as HTMLSelectElement).addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value as import('./types').ColormapKey;
  controller.setOptions({ colormap: v });
});

(document.getElementById('magScale') as HTMLSelectElement).addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value;
  controller.setOptions({ magScale: v as never });
  updateLegend();
});

fieldTypeSel.addEventListener('change', () => {
  const ft = fieldTypeSel.value as FieldType;
  controller.setOptions({ fieldType: ft });
  if (!unitInput.dataset.touched) {
    unitInput.value = ft === 'electric' ? 'V/m' : 'T';
    controller.setOptions({ unit: unitInput.value });
  }
});
unitInput.addEventListener('input', () => {
  unitInput.dataset.touched = '1';
  controller.setOptions({ unit: unitInput.value });
});

document.getElementById('btnFit')!.addEventListener('click', () => {
  controller.fitView();
});
document.getElementById('btnReset')!.addEventListener('click', () => {
  controller.loadDataset(demoDataset());
  const title = document.getElementById('dataTitle');
  if (title) title.textContent = 'Two negative point charges (demo)';
  updateLegend();
});

// --- legend / colour bar ---
function updateLegend(): void {
  const st = controller.getState();
  const bar = document.getElementById('colorbarGradient');
  const mode = st.options.colorMode;
  if (!bar) return;
  if (mode === 'angle') {
    // rainbow gradient representing -180..180
    bar.style.background =
      'linear-gradient(to right, hsl(0,95%,55%), hsl(60,95%,55%), hsl(120,95%,55%), hsl(180,95%,55%), hsl(240,95%,55%), hsl(300,95%,55%), hsl(360,95%,55%))';
  } else {
    const steps = 24;
    const colors: string[] = [];
    const cmap = st.options.colormap;
    // import colorAtRGB lazily via dynamic import not needed; use module:
    // To avoid a circular dependency we inline a tiny ramp using CSS stops.
    for (let i = 0; i <= steps; i++) {
      colors.push(rgbFromPalette(cmap, i / steps));
    }
    bar.style.background = `linear-gradient(to right, ${colors.join(', ')})`;
  }
  // labels
  const lo = document.getElementById('colorbarMin');
  const hi = document.getElementById('colorbarMax');
  if (lo && hi && st.stats) {
    const m = st.options.magScale;
    if (mode === 'angle') {
      lo.textContent = '-180\u00b0';
      hi.textContent = '180\u00b0';
    } else {
      lo.textContent = '0';
      hi.textContent = fmtMag(st.stats.maxMag, m);
    }
  }
}

// Minimal palette ramp for the legend (mirrors colormaps.ts).
function rgbFromPalette(key: import('./types').ColormapKey, t: number): string {
  const [r, g, b] = colorAtRGB(key, t);
  return `rgb(${r},${g},${b})`;
}
void COLORMAP_KEYS;

function fmtMag(m: number, scale: string): string {
  void scale;
  if (m >= 1000 || (m < 0.001 && m !== 0)) return m.toExponential(1);
  return m.toFixed(3);
}

// initial load
controller.loadDataset(demoDataset());
document.getElementById('dataTitle')!.textContent = 'Two negative point charges (demo)';
updateLegend();

// also update legend/unit when data changes
controller.setOnChange((s) => {
  const ui = s.options;
  const ftEl = fieldTypeSel;
  if (ftEl.value !== ui.fieldType) ftEl.value = ui.fieldType;
  if (!unitInput.dataset.touched) unitInput.value = ui.unit;
  updateLegend();
});
