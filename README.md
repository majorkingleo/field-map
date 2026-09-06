# Field Map Viewer

Interactive web app to display **electrical or magnetic vector fields** as a
coloured field map. Upload field data (text file or drag & drop), and the app
draws the vectors over a smooth colour background with zoom, pan, arrow
overlay and an on-hover readout.

The app is purely client-side (no server needed to run it): open `index.html`
or serve the folder statically, and everything happens in the browser.

## Features

- Upload one or more **point sources** (files) and merge them into a single
  field; remove sources individually or append more with **Add point**.
- Field strength rendered as a smooth **heatmap background**
  (yellow → orange → red → purple), switchable to other colour maps and to
  direction/angle colouring.
- **Vector arrows** on top, with a slider to scale their size.
- Zoom, pan, and an on-hover readout showing `x, y, |E|, angle`.
- Dark and light themes, persisted in the browser.
- Understands the table formats described in `DATA-FORMAT.md`, including the
  original two-row polar grid layout of the spec files under `specs/`.

## Usage

Build (TypeScript + Vite) and serve the result:

```sh
npm install
npm run build      # emits dist/app.js + dist/app.css
# open index.html, or serve the folder, e.g.:
npx vite preview
```

## Project history / credits

This project was **vibe-coded**: built interactively, feature by feature, in
pair-programming style with an AI coding assistant rather than from a formal
specification.

- **Author / maintainer:** Martin Oberzalek
- **Vibe-coded with:** GitHub Copilot in Visual Studio Code (AI assistant
  based on Claude / DeepSeek models), which wrote, reviewed and debugged the
  code together with the author across the whole project lifetime
  (design, parsing, canvas rendering, theming, deployment scripts).
- **Inspiration / data source:** the original electric-field examples emailed
  as `specs/*` (GMX mails with angle/strength tables for point charges).

## License

[MIT](./LICENSE) © 2026 Martin Oberzalek
