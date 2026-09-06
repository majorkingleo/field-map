# Field Map Viewer - Data Format

A vector field is described by one vector at every grid point.
Each vector has:

- a **position** `(x, y)` - in a Cartesian plane,
- a **magnitude** `|F|` (field strength, e.g. in `V/m`, `T`, `a.u.`),
- a **direction**.

The grid does not need to be rectangular. Any list of points works,
the renderer colours the space between the points automatically.

Two interchangeable column layouts are accepted. Both use the same angle
convention: **degrees, measured like `atan2(v, u)`**.

| Angle | Meaning                                    |
|-------|--------------------------------------------|
| `0`   | points east (right)                        |
| `90`  | points north (up)                          |
| `180` / `-180` | points west (left)                |
| `-90` | points south (down)                        |

## Layout 1 - Cartesian components (recommended)

```
# comment lines start with # or ;
x   y     u        v
-10 10    0.001    -0.011
-9.5 9.5  ...
```

- `u` = component towards **east** (x direction)
- `v` = component towards **north** (y direction)
- magnitude is computed automatically: `|F| = sqrt(u*u + v*v)`

## Layout 2 - Polar: magnitude + angle

```
# comment
x   y    mag    deg
-10 10   0.011  -135
```

- `mag` = magnitude of the vector
- `deg` = direction in degrees as in the table above
- components are computed internally: `u = mag*cos(deg)`, `v = mag*sin(deg)`

## Header row

The first non-comment line may name the columns:

```
x y mag deg
```

or

```
x y u v
```

This line is optional. When present it is used to decide which layout to
use: a header containing the words `deg`, `angle` or `winkel` selects the
polar layout; otherwise the cartesian layout is assumed.

European decimal commas are accepted (`1,5` = `1.5`).

## Missing / singular points

Mark a masked point (charge location, sensor failure, singularity) with
`-999.0` for the magnitude (polar layout) or for both components
(cartesian layout):

```
0 0 -999.0 0      # polar: magnitude -999 -> masked
0 0 -999.0 -999.0 # cartesian: masked
```

Masked points are never drawn and do not influence the colour scale.
> A single `u = -999` with `v = 0` also masks the point in cartesian layout.

## Full example (electric field, two point charges)

```
# E-field of two point charges q = -1 at (-5, 0) and (+5, 0)
# region: x from -10 to 10, y from 10 to -10, step 0.5
x y mag deg
-10.0 10.0 0.011 -55
-9.5 10.0 0.011 -57
-9.0 10.0 0.012 -59
-8.5 10.0 0.012 -61
...
```

The `deg` values come straight from the example files under `specs/`
(angle of `atan2`, `180/-180` horizontal, `+/-90` vertical).

## Layout 3 - two-row polar grid (original email format)

The original example files (e.g. `example1.txt`, the GMX mails in `specs/`)
do not use one line per point. They lay the grid out as a table where every
horizontal line `y` is written as a PAIR of rows:

1. one row of directions in degrees, ending with `winkel in grad`,
2. the next row of magnitudes, ending with `Feldstärke`.

The x positions of the columns are given once by a header line:

```
x=-10.0 x=-9.5 x=-9.0 x=-8.5 x=-8.0 x=-7.5 x=-7.0 x=-6.5 x=-6.0 x=-5.5 x=-5.0 x=-4.5 x=-4.0 x=-3.5 x=-3.0 x=-2.5 x=-2.0 x=-1.5 x=-1.0 x=-0.5 x= 0.0  Spalte x
-------------------------------------------------------------------------------------------------------------------------------------
   -79    -82    -86    -89    -93    -97   -101   -105   -109 -114   -119   -124   -129   -135   -141   -147   -153   -160 -166   -173    180   winkel in grad     Zeile y :   1    y=  10.0
  0.006  0.006  0.006  0.006  0.007  0.007  0.007  0.007  0.007 0.007  0.007  0.007  0.007  0.007  0.007  0.007  0.007  0.007 0.007  0.007  0.007   Feldstärke
   ...
```

- the y value of each line comes from the row trailer `... y= 10.0`
- an angle of `777` / `999` or a magnitude of `-999.0` marks a masked point
  (the charge location) - those points are never drawn

Optional `#` comment lines above the table can name the charges so the app
draws charge markers:

```
# q1 Ladung : neg        (or: pos)
# q1 auf -5 0
# q2 Ladung : neg
# q2 auf +5 0
```

> This layout is auto-detected. If you produce your data yourself, prefer
> **Layout 1 or 2** (one point per line) - they are simpler and faster.

## Detecting the layout automatically

Upload a file and the app decides by itself:

| File looks like                            | Layout |
|--------------------------------------------|--------|
| has `winkel in grad` + `Feldstärke` rows, x header `x=-...` | 3 (two-row grid) |
| first data line has 4 numbers              | 1 or 2 (column table)  |

When in doubt the column-table parser is used and any skipped lines are
reported under the upload button.

## Generating the data

Export your data from a program, e.g. in Python:

```python
import math

q = [(-5.0, 0.0, -1.0), (5.0, 0.0, -1.0)]

def field(x, y):
    u = v = 0.0
    for qx, qy, qv in q:
        dx, dy = x - qx, y - qy
        r2 = dx*dx + dy*dy
        if r2 < 1e-12:
            return None          # singular point
        f = qv / r2**1.5
        u += f*dx
        v += f*dy
    return u, v

with open("field.txt", "w") as fh:
    fh.write("x y u v\n")
    for y in [10.0 - 0.5*i for i in range(41)]:
        for x in [-10.0 + 0.5*i for i in range(41)]:
            r = field(x, y)
            if r is None:
                fh.write(f"{x: .1f} {y: .1f} -999.0 -999.0\n")
            else:
                u, v = r
                fh.write(f"{x: .1f} {y: .1f} {u:.4f} {v:.4f}\n")
```

## Field strength conventions (physics background)

- **Electric field** from a point charge `q` at distance `r`:
  `|E| = k |q| / r^2`, direction radial: away from positive, towards negative.
- **Magnetic field** `B` follows the same vector-field idea but the sources
  are currents/dipoles. The app is agnostic: it just draws the vectors you
  provide and uses the unit you type (`V/m`, `T`, ...).
