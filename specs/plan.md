# Field Map Viewer — Implementation Plan

Goal: a TypeScript web page that shows electrical or magnetic vector fields as
a coloured field map. The user uploads field data (file or drag & drop), the
app draws it on a canvas, with zoom, pan, colouring, arrow overlay and a
readout.

The text below is the plan that was followed to build the current version.

## 1. Requirements (from specs/)

The `specs/` folder contains two forwarded emails:

- `vektorfeld beispiel.html` — an example of a vector field:
  "Jedem Rasterpunkt ist ein Vektor zugeordnet" (every grid point carries a
  vector), shown as ASCII arrows over a 2-D raster (x from -7 to +6, columns
  numbered 7..33).
- `Aw_ Fwd_ feld punktladung neg neg.html` — a real electric-field dataset,
  text tables for two negative point charges q1 = (-5, 0), q2 = (+5, 0):
  - grid x = -10..10, y = 10..-10, step 0.5 (41 x 41 = 1681 points)
  - two interleaved rows per lattice line: field **strength** (|E|) and
    **angle** in degrees; a row comment gives the y value of each lattice row
  - angle is `atan2`, may be negative or positive; 180/-180 = horizontal,
    +/-90 = vertical
  - singular points at the charges are marked `-999.0` / `777`

Interpretation: the deliverable is an interactive viewer for such vector
fields. User story derived from the specs:

> As a user I upload field data as text. The page renders the field as a
> coloured map with vector arrows. I can zoom and pan, switch between
> magnitude and direction colouring, and hover to read exact values.

Out of scope for the first version: the legacy two-row text tables themselves
(the angle row follows the magnitude row). The specs only *describe* that
format; the page instead documents and accepts a clean table format (see
`DATA-FORMAT.md`), and ships the same two-negative-charges field as a demo.

## 2. Architecture

Stack chosen because the target is a plain directory under Apache
(`http://localhost/~martin/field-map/`, i.e. a static web root, no server):

- **Language / build:** TypeScript + Vite
- **Rendering:** HTML5 Canvas (two stacked canvases)
- **No UI framework** — small DOM, vanilla controller

Apache serves the repository root directly, so `index.html` is a static page
that references the *built* bundle `dist/app.js` + `dist/app.css`. Vite input
is `src/main.ts` (not index.html) so the build never has to resolve `./dist/*`.
CSS is imported from `src/main.ts` and emitted as `dist/app.css`.

```
field-map/
  index.html          static shell, references dist/app.{js,css}
  DATA-FORMAT.md      the file format users must use (user facing)
  plan.md             this plan
  specs/              original email specs (read-only)
  src/
    types.ts          FieldDataset, VectorSample, options (shared types)
    dataset.ts        statistics, magnitude + transfer functions
    colormaps.ts      colour palettes (viridis/inferno/...) + angle colour
    parser.ts         text upload -> FieldDataset (cartesian or polar table)
    renderer.ts       raster colour field + overlay (arrows/grid/axes/charges)
    state.ts          view transform, options, fit/zoom/pan helpers
    app.ts            FieldMapController: DOM, input, render scheduling
    demo.ts           built-in two-charge dataset (mirrors the spec data)
    main.ts           wiring: buttons, selects, legend, file load
    styles.css        dark UI
  dist/               build output (committed? see "Build & deploy")
```

## 3. Data model

```ts
interface VectorSample { x, y: number; u, v: number; valid: boolean }
//   u = east component, v = north component
//   angle convention = atan2(v, u), degrees; 180/-180 = west, +/-90 vertical
interface FieldDataset {
  title; fieldType: 'electric' | 'magnetic'; unit: string;
  charges: {x,y,q}[];            // optional markers (sinks / sources)
  regions: { name, samples: VectorSample[] }[];
}
```

Magnitude is never stored: it is `hypot(u, v)`. -999 masked values are turned
into `valid = false`.

## 4. Rendering pipeline

Two canvases in one absolutely-positioned wrapper:

- **colour canvas** — a rasterised colour field:
  - view transform `px = originX + x*scale`, `py = originY - y*scale`
  - samples are accumulated into a low-res buffer (target ~10 px/cell,
    capped 2048x2048): sum of relative magnitude, sum of u/v, count
  - per cell: magnitude mode -> transfer `scaleMag01` + palette lookup;
    angle mode -> `atan2(v,u)` mapped to a hue (HSB)
  - the small buffer is `putImageData`-ed then nearest-neighbour scaled to the
    full canvas (`imageSmoothingEnabled=false`)
  - rebuild is cached: only on dataset/options/zoom change (`colorDirty`)
- **overlay canvas** — redrawn on every pan/zoom:
  - vector arrows, decimated to ~46 px spacing from the sample lattice
    (auto step from `dx,dy` of the grid, min 1 = every sample)
  - faint grid + axes (nice step: 1/2/5 x 10^k so spacing ~70 px)
  - charge markers (+/-) from the dataset, if any

Panning during a drag re-renders the overlay immediately; the colour field is
rebuilt when the drag ends / on rAF idle. Zoom keeps the world point under the
cursor fixed (`zoomAt`). `fitToDataset` centres the data with a 6% margin.

## 5. Colouring & legend

Colour modes (dropdown "Show"):

- **magnitude** — palette `viridis|inferno|magma|plasma|cividis|coolwarm|gray`
  with transfer `linear|sqrt|log` applied to `|F|/max(|F|)`
- **direction** — angle mapped through a fixed cyclic hue ramp
  (legend shows -180..180); arrows take the same colour as the field

The legend gradient and its min/max labels are rendered in CSS from the same
palette data so the colour bar always matches the plot. `max` label reflects
the transfer: sqrt/log shift the visible scale for the arrow and bar
mid-ticks are not drawn (only 0 and max).

## 6. Upload & file format

- "Upload file" button opens the file picker; the canvas is a drop target too.
- Text is parsed by `parser.ts`:
  - header line optional; polar layout selected when the header contains
    `deg`/`angle`/`winkel`
  - cartesian columns `x y u v`, polar columns `x y mag deg`
  - comments `#` / `;`, blank lines ignored, European comma decimal accepted
  - `-999` = masked point
- Problems in single lines are collected and shown; an empty result prints a
  hint to read `DATA-FORMAT.md`.
- The demo dataset `demo.ts` reproduces the two negative charges from the spec
  (41x41, step 0.5, -999 masked at the charges), so the page works with zero
  user input and is directly comparable with the email output.

## 7. UI

Sidebar (dark): brand, Data (upload, field type electric/magnetic, unit),
Colouring (mode, palette, scale), View (arrows/grid/axes/charges, fit/demo),
Legend bar. Bottom-left readout on hover:
`x, y, |E| unit, angle`.

## 8. Build & deploy

- `npm run build`  -> typecheck + emit `dist/app.js`, `dist/app.css`
- `npm run watch`  -> rebuild on every `src/` change (for Apache deploy)
- Preview locally: `npx vite preview` or plain Apache
- Served at `http://localhost/~martin/field-map/` (Apache user-dir).

Deployment = copy the repo (or run build on the server) to the web root and
reload. `dist/` is a generated artifact.

## 9. Verification

- `npx tsc --noEmit` — clean
- open Apache URL, demo dataset renders (coloured field + arrows + grid +
  axes + charges), legend shows max ≈ 4.009 like the spec
- wheel zoom re-renders both canvases, drag pans, hover readout reports
  correct world values

## 10. Next steps / future ideas

- Parse the exact legacy two-row spec layout (angle+strength per row) as an
  optional import, using the y-label comments
- Vector-field line integration (field lines through the data)
- Logarithmic arrow length option
- Symmetric colour scale around 0 for signed scalars
- Export the rendered map to PNG
- Multiple files -> multiple datasets / region overlay
- Magnetic dipole demo (B field of a dipole)
