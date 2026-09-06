import { FieldMapController } from './app';
import { demoDataset } from './demo';
import { parseFieldFileAuto } from './parser';
import { mergeDatasets } from './dataset';
import { colorForTheme, COLORMAP_KEYS } from './colormaps';
import type { FieldType } from './types';
import './styles.css';

// ---------------------------------------------------------------------------
// UI wiring: toolbar, file upload, legend and readout.
// ---------------------------------------------------------------------------

const root = document.getElementById('app')!;
const controller = new FieldMapController(root);

// --- demo / sample button ---
document.getElementById('btnDemo')!.addEventListener('click', () => {
  sources = [];
  rebuildFromSources();
});

// --- file upload ---
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const pointInput = document.getElementById('pointInput') as HTMLInputElement;
const fieldTypeSel = document.getElementById('fieldType') as HTMLSelectElement;
const unitInput = document.getElementById('unitInput') as HTMLInputElement;
const sourceListEl = document.getElementById('sourceList') as HTMLElement;

interface Source {
  name: string;
  dataset: ReturnType<typeof parseFieldFileAuto>['dataset'];
  count: number;
  issues: string[];
}

// All uploaded point sources (each file = one removable source).
let sources: Source[] = [];

function currentUnit(): string {
  const ftype = (fieldTypeSel.value as FieldType) || 'electric';
  return unitInput.value.trim() || (ftype === 'electric' ? 'V/m' : 'T');
}

function currentFieldType(): FieldType {
  return (fieldTypeSel.value as FieldType) || 'electric';
}

/** Merge all current sources, push them to the controller, refresh the UI. */
function rebuildFromSources(): void {
  const parts = sources.map((s) => s.dataset);
  if (parts.length === 0) {
    controller.loadDataset(demoDataset());
    setTitleText('Two negative point charges (demo)');
  } else {
    const merged = mergeDatasets(parts, 'Uploaded data', currentFieldType(), currentUnit());
    controller.loadDataset(merged);
    controller.setOptions({ unit: currentUnit() });
    setTitleText(
      sources.length === 1
        ? sources[0].name
        : `${sources.length} point sources (${merged.regions[0]?.samples.length ?? 0} points)`,
    );
  }
  renderSourceList();
  renderIssues();
  updateLegend();
}

function renderIssues(): void {
  const errEl = document.getElementById('issues');
  if (!errEl) return;
  const withIssues = sources.filter((s) => s.issues.length > 0);
  if (withIssues.length === 0) {
    errEl.textContent = '';
    return;
  }
  const first = withIssues[0];
  errEl.textContent = `${first.name}: ${first.issues[0]} (${withIssues.length} source(s) with issues)`;
}

function setTitleText(text: string): void {
  const el = document.getElementById('dataTitle');
  if (el) el.textContent = text;
}

function renderSourceList(): void {
  if (!sourceListEl) return;
  sourceListEl.textContent = '';
  if (sources.length === 0) return;
  const heading = document.createElement('div');
  heading.className = 'sourceListHeading';
  heading.textContent = `Uploaded points (${sources.length})`;
  sourceListEl.appendChild(heading);

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const item = document.createElement('div');
    item.className = 'sourceItem';

    const info = document.createElement('div');
    info.className = 'sourceInfo';
    const name = document.createElement('span');
    name.className = 'sourceName';
    name.textContent = s.name;
    name.title = s.name;
    const count = document.createElement('span');
    count.className = 'sourceCount';
    count.textContent = `${s.count} pts`;
    info.appendChild(name);
    info.appendChild(count);

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'sourceRemove';
    rm.textContent = '\u00d7';
    rm.title = 'Remove this point source';
    rm.addEventListener('click', () => {
      sources.splice(i, 1);
      rebuildFromSources();
    });

    item.appendChild(info);
    item.appendChild(rm);
    sourceListEl.appendChild(item);
  }
}

async function parseFile(file: File): Promise<Source | null> {
  const text = await file.text();
  const name = file.name.replace(/\.[^.]+$/, '');
  const res = parseFieldFileAuto(text, name, currentFieldType(), currentUnit());
  const count = res.dataset.regions.reduce((a, r) => a + r.samples.length, 0);
  const issues = res.issues.map((i) => i.message);
  return { name, dataset: res.dataset, count, issues };
}

/** Upload new files: append them as additional point sources. */
async function onFiles(fileList: File[]): Promise<void> {
  const files = [...fileList].filter((f) => f.size > 0);
  if (files.length === 0) return;

  for (const file of files) {
    const src = await parseFile(file);
    if (src) sources.push(src);
  }
  rebuildFromSources();
}

document.getElementById('btnUpload')!.addEventListener('click', () => fileInput.click());
document.getElementById('btnAddPoint')!.addEventListener('click', () => pointInput.click());
fileInput.addEventListener('change', () => {
  const files = fileInput.files;
  if (files && files.length) void onFiles(Array.from(files));
  fileInput.value = '';
});
pointInput.addEventListener('change', () => {
  const files = pointInput.files;
  if (files && files.length) void onFiles(Array.from(files));
  pointInput.value = '';
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
  const files = e.dataTransfer?.files;
  if (files && files.length) void onFiles(Array.from(files));
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

// --- arrow size slider ---
const arrowScaleInput = document.getElementById('arrowScale') as HTMLInputElement;
const arrowScaleVal = document.getElementById('arrowScaleVal') as HTMLElement;
arrowScaleInput.addEventListener('input', () => {
  const v = Number(arrowScaleInput.value) || 1;
  controller.setOptions({ arrowScale: v });
  if (arrowScaleVal) arrowScaleVal.textContent = `${v.toFixed(1)}\u00d7`;
});

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
  sources = [];
  rebuildFromSources();
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

// Minimal palette ramp for the legend (mirrors colormaps.ts). The ramp uses
// the same theme adaptation as the field so plot + legend always match.
function rgbFromPalette(key: import('./types').ColormapKey, t: number): string {
  const [r, g, b] = colorForTheme(key, t);
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

// ---------------------------------------------------------------------------
// Data-format guide modal: fetch DATA-FORMAT.md, offer HTML / Plain views and
// a raw-file link.
// ---------------------------------------------------------------------------

import { marked } from 'marked';

const modal = document.getElementById('helpModal')!;
const content = document.getElementById('helpContent') as HTMLElement;
const plain = document.getElementById('helpPlain') as HTMLPreElement;
const tabHtml = document.getElementById('tabHtml') as HTMLButtonElement;
const tabPlain = document.getElementById('tabPlain') as HTMLButtonElement;

async function openHelp(): Promise<void> {
  modal.classList.remove('hidden');
  if (!content.dataset.loaded) {
    try {
      const res = await fetch('./DATA-FORMAT.md');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const md = await res.text();
      content.innerHTML = await marked.parse(md);
      plain.textContent = md;
      content.dataset.loaded = '1';
      // make in-doc links open in a new tab
      content.querySelectorAll('a[href^="http"]').forEach((a) => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      });
    } catch (err) {
      content.innerHTML =
        '<p>Could not load <code>DATA-FORMAT.md</code>. ' +
        'Use the "Open raw" link to view the file directly.</p>';
      void err;
    }
  }
  showHelpTab('html');
}

function closeHelp(): void {
  modal.classList.add('hidden');
}

function showHelpTab(which: 'html' | 'plain'): void {
  const isHtml = which === 'html';
  content.classList.toggle('hidden', !isHtml);
  plain.classList.toggle('hidden', isHtml);
  tabHtml.classList.toggle('active', isHtml);
  tabPlain.classList.toggle('active', !isHtml);
}

document.getElementById('btnHelp')!.addEventListener('click', () => void openHelp());
document.getElementById('btnCloseHelp')!.addEventListener('click', closeHelp);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeHelp();
});
tabHtml.addEventListener('click', () => showHelpTab('html'));
tabPlain.addEventListener('click', () => showHelpTab('plain'));

// ---------------------------------------------------------------------------
// About modal: README + LICENSE, fetched and rendered from markdown.
// ---------------------------------------------------------------------------

const aboutModal = document.getElementById('aboutModal')!;
const aboutReadme = document.getElementById('aboutReadme') as HTMLElement;
const aboutLicense = document.getElementById('aboutLicense') as HTMLPreElement;
const aboutTabReadme = document.getElementById('aboutTabReadme') as HTMLButtonElement;
const aboutTabLicense = document.getElementById('aboutTabLicense') as HTMLButtonElement;

async function loadInto(el: HTMLElement, url: string, isPlain: boolean): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const md = await res.text();
  if (isPlain) {
    el.textContent = md;
  } else {
    el.innerHTML = await marked.parse(md);
    el.querySelectorAll('a[href^="http"]').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  }
}

async function openAbout(): Promise<void> {
  aboutModal.classList.remove('hidden');
  if (!aboutReadme.dataset.loaded) {
    try {
      await Promise.all([
        loadInto(aboutReadme, './README.md', false),
        loadInto(aboutLicense, './LICENSE', true),
      ]);
      aboutReadme.dataset.loaded = '1';
    } catch (err) {
      aboutReadme.innerHTML =
        '<p>Could not load <code>README.md</code> / <code>LICENSE</code>. ' +
        'Use the raw links to view the files directly.</p>';
      void err;
    }
  }
  showAboutTab('readme');
}

function closeAbout(): void {
  aboutModal.classList.add('hidden');
}

function showAboutTab(which: 'readme' | 'license'): void {
  const isReadme = which === 'readme';
  aboutReadme.classList.toggle('hidden', !isReadme);
  aboutLicense.classList.toggle('hidden', isReadme);
  aboutTabReadme.classList.toggle('active', isReadme);
  aboutTabLicense.classList.toggle('active', !isReadme);
}

document.getElementById('btnAbout')!.addEventListener('click', () => void openAbout());
document.getElementById('btnCloseAbout')!.addEventListener('click', closeAbout);
aboutModal.addEventListener('click', (e) => {
  if (e.target === aboutModal) closeAbout();
});
aboutTabReadme.addEventListener('click', () => showAboutTab('readme'));
aboutTabLicense.addEventListener('click', () => showAboutTab('license'));

// A single Escape closes whichever modal is open.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const anyOpen = [modal, aboutModal].some((m) => !m.classList.contains('hidden'));
  if (anyOpen) {
    closeHelp();
    closeAbout();
  }
});

// ---------------------------------------------------------------------------
// Theme switch (dark / light). Persisted in localStorage; the inline script in
// index.html applies the saved value before first paint.
// ---------------------------------------------------------------------------

type Theme = 'dark' | 'light';

const darkBtn = document.getElementById('themeDark') as HTMLButtonElement;
const lightBtn = document.getElementById('themeLight') as HTMLButtonElement;

function currentTheme(): Theme {
  const a = document.documentElement.getAttribute('data-theme');
  return a === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  darkBtn.classList.toggle('active', theme === 'dark');
  lightBtn.classList.toggle('active', theme === 'light');
  try {
    localStorage.setItem('fieldmap-theme', theme);
  } catch {
    /* private mode: ignore */
  }
  controller.redraw();
  updateLegend();
}

darkBtn.addEventListener('click', () => applyTheme('dark'));
lightBtn.addEventListener('click', () => applyTheme('light'));
applyTheme(currentTheme());
