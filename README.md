# Pow Predictor

3D snow redistribution simulator for alpine terrain. Models how wind transports snow through mountains — scouring ridges and depositing on lee slopes — to predict where powder accumulates after storms.

**Live:** [d1y1xbjzzgjck0.cloudfront.net](https://d1y1xbjzzgjck0.cloudfront.net)

## Features

- **3D Terrain** — Real elevation data via CesiumJS with mountain search across Norway
- **Manual Mode** — Set wind direction, speed, and temperature to instantly see predicted snow redistribution
- **Simulation Mode** — Fetches 12 days of real weather data (7 days history + 5 days forecast) and steps through a time-evolving snow simulation
- **Hybrid Weather** — NVE seNorge grid for historical data, MET Norway Locationforecast (yr.no) for accurate terrain-aware forecast wind
- **Spatial Weather** — 9-station 3×3 grid with IDW interpolation, lapse rate correction (-6.5°C/km), and orographic precipitation
- **Snow Depth Probe** — Click any point in simulation mode to see predicted snow depth, temperature, precipitation, wind, and elevation
- **Wind Animation** — 10,000 snow-like particles flowing through terrain with turbulence
- **Powder Zone Detection** — Highlights where uncompacted powder survives (sheltered, low-wind, cold areas)
- **Progressive Web App** — Add to home screen on iPhone/Android for a native app experience
- **Responsive** — Full mobile layout with adaptive controls, safe area handling for notched devices

## Physics Model

### Wind Field Solver

A simplified diagnostic wind model inspired by WindNinja:

1. **Initialization** — Uniform wind field with logarithmic vertical profile (`z0 = 0.03m` roughness, reference height 50m)
2. **Terrain interaction** — Windward deceleration, lee-side flow separation, and ridge speed-up (up to 2.0x for steep Norwegian alpine terrain)
3. **Mass conservation** — Iterative Gauss-Seidel relaxation of the divergence equation across 2 layers (10m and 50m AGL)
4. **Terrain exposure** — Winstral Sx parameter (maximum upwind shelter angle over 300m search distance) determines which cells are exposed ridges vs sheltered valleys. Precomputed for 8 azimuth sectors on terrain load, interpolated per wind direction at runtime.

### Snow Redistribution (2D Saltation Advection)

Snow redistribution uses a physically-based advection model rather than simple per-cell factors. Snow is physically transported downwind from ridges to lee slopes:

1. **Erosion** — Pomeroy-Gray saltation flux `Q ~ u*(u*^2 - u*_th^2)` gives cubic/quartic scaling with wind speed. At 15 m/s, erosion is roughly 8x that at 7 m/s (a linear model would predict only 2x).

2. **Temperature-dependent thresholds** — Based on Li & Pomeroy (1997). Fresh dry powder at -15C starts moving at ~4 m/s wind; wet snow near 0C resists transport until ~15 m/s.

3. **Fetch-limited erosion** — Erosion only occurs when current saltation transport is below equilibrium capacity. A 500m exposed plateau erodes far more than a narrow 50m ridge crest.

4. **Advection** — First-order upwind finite-difference scheme moves saltation mass downwind through the grid.

5. **Deposition** — Controlled by Winstral Sx: sheltered cells (positive Sx) capture passing transport mass.

6. **Sublimation** — 2-5% of airborne snow sublimates per advection iteration (15-25% total loss at moderate wind).

7. **Slope shedding** — Slopes steeper than 40° shed excess snow due to gravity.

### Weather Data Sources

| Source | Coverage | Purpose | Wind Quality |
|--------|----------|---------|-------------|
| **NVE seNorge** | 7 days history | Temperature, precip, wind (observation-interpolated 1km grid) | Low at summits |
| **MET Locationforecast** | 9 days forecast | Temperature, precip, wind (MEPS 2.5km NWP model) | Accurate terrain-aware |

The two sources are spliced at the current time — NVE provides the historical record, MET provides the forecast with realistic summit wind speeds (matching yr.no).

### Spatial Downscaling

Weather is fetched from a 3×3 grid (9 stations) across the terrain bounding box, then downscaled to the 75m simulation grid:

- **IDW interpolation** — Inverse-distance-weighted blending from 9 stations per grid cell
- **Lapse rate** — -6.5°C per 1000m elevation difference (valleys get rain while peaks get snow)
- **Orographic precipitation** — +8% per 100m above reference altitude
- **Wind** — Highest-altitude stations feed the solver (represents free-atmosphere wind); Sx handles sheltering

### Simplifications and Limitations

This is a browser-based educational tool, not a forecasting system. Key simplifications:

- **No suspension transport** — Only saltation is modeled. Above ~15 m/s, snow suspends to 100m+ height.
- **No snow microstructure** — Single uniform layer, no density/grain type/bonding.
- **Simplified wind solver** — Diagnostic terrain adjustments, not full Navier-Stokes.
- **Fixed grid resolution** — 75m cells (120m on mobile). Real features can be smaller.
- **No vegetation** — Forest canopy effects not modeled.
- **No avalanche dynamics** — Simple slope shedding threshold only.
- **2D advection only** — No vertical recirculation (cornice formation).

### References

- Pomeroy, J.W. & Gray, D.M. (1990). Saltation of snow. *Water Resources Research*, 26(7), 1583-1594.
- Li, L. & Pomeroy, J.W. (1997). Estimates of threshold wind speeds for snow transport. *Journal of Applied Meteorology*, 36(3), 205-213.
- Winstral, A., Elder, K. & Davis, R.E. (2002). Spatial snow modeling of wind-redistributed snow using terrain-based parameters. *Journal of Hydrometeorology*, 3(5), 524-538.
- Lehning, M. et al. (2008). Inhomogeneous precipitation distribution and snow transport in steep terrain. *Water Resources Research*, 44(7).

## Running Locally

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- A free Cesium Ion token (for 3D terrain data)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/edevardHvide/alpine-wind.git
cd alpine-wind

# 2. Install dependencies
npm install

# 3. Get a Cesium Ion token
#    Go to https://ion.cesium.com/tokens and create a free account.
#    Copy your default access token.

# 4. Create your .env file
cp .env.example .env
#    Open .env and replace "your_token_here" with your Cesium Ion token.

# 5. Start the development server
npm run dev
```

Open http://localhost:5173 in your browser.

### Mobile Testing

```bash
npm run dev -- --host
```

Then open `http://<your-local-ip>:5173` on your phone. Use Share → Add to Home Screen for the PWA experience.

### Usage

- **Manual mode** — Use the wind compass and slider. Snow redistribution updates automatically.
- **Simulation mode** — Click "Run Pow Simulation", select a mountain. Timeline controls playback.
- **Snow depth probe** — Click any point in simulation mode for depth + weather details.
- **Search** — Type a mountain name to fly to it (Kartverket API).

### Building for Production

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build locally
```

### Tests

```bash
npx tsc --noEmit        # type check
npx playwright test     # E2E tests (smoke, spatial weather, PWA)
```

## Tech Stack

- React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4
- CesiumJS 1.139 (3D globe and terrain)
- NVE GridTimeSeries API (historical weather, proxied through Vite dev server / API Gateway)
- MET Norway Locationforecast 2.0 (forecast weather, direct CORS)
- Kartverket Stedsnavn API (mountain search)
- Web Worker for off-main-thread simulation
- PWA with web app manifest (installable on mobile)
- No backend — all simulation runs client-side

## License

MIT
