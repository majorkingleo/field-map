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
