import type { ColormapKey } from './types';

// Colour maps as compact anchor lists of [r, g, b]. Values are interpolated.
// The anchors are approximated from the well known matplotlib palettes, so the
// rendered images look familiar to scientists.

type RGB = [number, number, number];

const STOPS: Record<ColormapKey, RGB[]> = {
  viridis: [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
    [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89],
    [180, 222, 44], [253, 231, 37],
  ],
  inferno: [
    [0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106],
    [186, 54, 85], [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164],
  ],
  magma: [
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129],
    [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
  ],
  plasma: [
    [13, 8, 135], [84, 2, 163], [139, 10, 165], [185, 50, 137],
    [219, 92, 104], [244, 136, 73], [254, 188, 43], [240, 249, 33],
  ],
  cividis: [
    [0, 32, 77], [9, 46, 92], [21, 57, 102], [31, 70, 110],
    [41, 82, 113], [49, 94, 114], [58, 106, 112], [67, 118, 109],
    [75, 129, 106], [81, 141, 103], [85, 153, 101], [88, 166, 99],
    [86, 178, 99], [75, 190, 99], [46, 203, 96], [3, 217, 92],
    [0, 231, 103], [0, 245, 145], [0, 255, 201],
  ],
  coolwarm: [
    [59, 76, 192], [108, 126, 211], [156, 165, 221], [201, 205, 227],
    [245, 243, 234], [231, 205, 177], [216, 155, 100], [198, 116, 39],
    [188, 55, 84],
  ],
  gray: [
    [0, 0, 0], [255, 255, 255],
  ],
};

export const COLORMAP_KEYS = Object.keys(STOPS) as ColormapKey[];

export function colorAt(key: ColormapKey, t01: number): string {
  const stops = STOPS[key];
  const t = Math.max(0, Math.min(1, t01));
  const pos = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = stops[i];
  const b = stops[i + 1];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

export function colorAtRGB(key: ColormapKey, t01: number): RGB {
  const stops = STOPS[key];
  const t = Math.max(0, Math.min(1, t01));
  const pos = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** Direction colouring (angle mode): cyclic hue, independent of palette. */
export function angleColor(deg: number): string {
  const h = ((deg + 180) % 360 + 360) % 360;
  return `hsl(${h.toFixed(0)}, 95%, 55%)`;
}

// ---------------------------------------------------------------------------
// Theme adaptation for the field colours.
//
// Dark theme: palettes are used as-is (their low end is very dark, ideal on a
// dark canvas). Light theme: colours are blended toward white so the field
// stays readable as a soft pastel ramp instead of a black blob on a white
// background. The legend bar applies the same blend so plot and legend always
// match.
// ---------------------------------------------------------------------------

export function isLightTheme(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light'
  );
}

/** Blend a palette colour toward white by `amount` in [0,1]. */
export function lightenToTheme(rgb: RGB, light: boolean, amount = 0.62): RGB {
  if (!light) return rgb;
  return [
    Math.round(rgb[0] + (255 - rgb[0]) * amount),
    Math.round(rgb[1] + (255 - rgb[1]) * amount),
    Math.round(rgb[2] + (255 - rgb[2]) * amount),
  ];
}
