// ── Simulation Coefficients ──────────────────────────────────────────
// Central registry of all tunable physics and solver parameters.
// Import from here instead of scattering constants across modules.

// ── Wind Solver ─────────────────────────────────────────────────────

/** Vertical layer heights in meters above ground level */
export const LAYER_HEIGHTS = [10, 50];
/** Max Gauss-Seidel iterations for mass conservation */
export const MAX_ITERATIONS = 100;
/** Convergence threshold for divergence check */
export const DIVERGENCE_THRESHOLD = 0.005;
/** Relaxation factor for Gauss-Seidel solver */
export const RELAXATION_ALPHA = 0.1;
/** Surface roughness length z0 (meters) */
export const SURFACE_ROUGHNESS = 0.03;
/** Reference height for log-law wind profile (meters) */
export const REF_HEIGHT = 50;

// ── Snow Model ──────────────────────────────────────────────────────

/** Default snowfall for manual (non-historical) simulation (cm) */
export const BASE_SNOWFALL_CM = 50;
/** Von Karman drag coefficient: u* = surfaceSpeed × this */
export const KARMAN_DRAG_COEFF = 0.04;
/** Powder survival: minimum temperature (°C) */
export const POWDER_TEMP_MIN = -10;
/** Powder survival: maximum temperature (°C) */
export const POWDER_TEMP_MAX = -5;
/** Skiable slope range: minimum steepness (degrees) */
export const SKIABLE_SLOPE_MIN = 25;
/** Skiable slope range: maximum steepness (degrees) */
export const SKIABLE_SLOPE_MAX = 45;
/** Number of saltation advection iterations per simulation step */
export const ADVECTION_ITERATIONS = 12;

// ── Historical Simulation ───────────────────────────────────────────

/** 1mm water = 10mm (1cm) snow */
export const SNOW_WATER_RATIO = 10;
/** Melt rate: mm water equivalent per °C per 3h step */
export const MELT_DEGREE_FACTOR = 0.5;
/** Additional melt per mm rain */
export const RAIN_MELT_FACTOR = 0.2;
/** Sub-steps per 3h weather interval (= 45-minute resolution) */
export const SUB_STEPS = 4;
/** Duration of one weather interval in ms */
export const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
/** Wind direction change threshold for re-solving wind field (degrees) */
export const WIND_DIR_CHANGE_THRESHOLD = 15;
/** Wind speed change threshold for re-solving wind field (m/s) */
export const WIND_SPEED_CHANGE_THRESHOLD = 2;

// ── Spatial Weather & Downscaling ───────────────────────────────────

/** Environmental lapse rate: °C per meter of elevation gain */
export const LAPSE_RATE = -6.5 / 1000;
/** Orographic precipitation enhancement: fractional increase per meter above reference */
export const PRECIP_ELEV_FACTOR = 0.08 / 100;

// ── Terrain ─────────────────────────────────────────────────────────

/** Default terrain grid cell size (meters). 75m desktop, 120m mobile via device.ts */
export const DEFAULT_CELL_SIZE = 75;

// ── Runtime Override Support ────────────────────────────────────────

export const DEFAULTS = {
  MAX_ITERATIONS,
  DIVERGENCE_THRESHOLD,
  RELAXATION_ALPHA,
  SURFACE_ROUGHNESS,
  REF_HEIGHT,
  BASE_SNOWFALL_CM,
  KARMAN_DRAG_COEFF,
  ADVECTION_ITERATIONS,
  POWDER_TEMP_MIN,
  POWDER_TEMP_MAX,
  SKIABLE_SLOPE_MIN,
  SKIABLE_SLOPE_MAX,
  SNOW_WATER_RATIO,
  MELT_DEGREE_FACTOR,
  RAIN_MELT_FACTOR,
  SUB_STEPS,
  WIND_DIR_CHANGE_THRESHOLD,
  WIND_SPEED_CHANGE_THRESHOLD,
  LAPSE_RATE,
  PRECIP_ELEV_FACTOR,
} as const;

export type CoefficientsOverride = Partial<typeof DEFAULTS>;

export interface SliderMeta {
  key: keyof typeof DEFAULTS;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}

export const COEFFICIENT_GROUPS: { name: string; sliders: SliderMeta[] }[] = [
  {
    name: "Wind Solver",
    sliders: [
      { key: "MAX_ITERATIONS", label: "Max Iterations", description: "Max Gauss-Seidel iterations for mass-conserving divergence correction. Higher values give more accurate wind fields but take longer. The solver usually converges in 20-50 iterations; increase if you see artifacts in complex terrain.", min: 10, max: 500, step: 10 },
      { key: "DIVERGENCE_THRESHOLD", label: "Divergence Threshold", description: "Convergence criterion for the wind solver — iteration stops when max divergence drops below this. Lower = more physically accurate but slower. Default 0.005 balances speed and quality.", min: 0.001, max: 0.05, step: 0.001 },
      { key: "RELAXATION_ALPHA", label: "Relaxation Alpha", description: "Under-relaxation factor for Gauss-Seidel. Controls how aggressively each iteration corrects divergence. Too high (>0.3) can cause oscillation; too low (<0.05) converges very slowly.", min: 0.01, max: 0.5, step: 0.01 },
      { key: "SURFACE_ROUGHNESS", label: "Surface Roughness (z0)", description: "Aerodynamic roughness length (meters). Determines the log-law wind profile shape near the surface. 0.03m = open alpine terrain. 0.001m = smooth ice/snow. 0.5m = dense forest. Affects how quickly wind speed increases with height.", min: 0.001, max: 0.5, step: 0.001 },
      { key: "REF_HEIGHT", label: "Reference Height", description: "Height (meters AGL) at which input wind speed is assumed to apply. The log-law profile scales wind from this height down to surface. Higher values mean the input wind represents conditions further from the ground.", min: 10, max: 200, step: 5 },
    ],
  },
  {
    name: "Snow Transport",
    sliders: [
      { key: "BASE_SNOWFALL_CM", label: "Base Snowfall (cm)", description: "Total snowfall depth for exploration (manual) mode, spread over 8 sub-steps to simulate a ~24h storm. This is NOT used in historical mode which gets real precipitation from NVE weather data.", min: 5, max: 100, step: 1 },
      { key: "KARMAN_DRAG_COEFF", label: "Von Karman Drag", description: "Converts 10m wind speed to friction velocity: u* = speed x drag_coeff. Controls how much shear stress the wind applies to the snow surface. Higher = more erosion at the same wind speed. Literature range: 0.03-0.06 for snow surfaces.", min: 0.01, max: 0.1, step: 0.005 },
      { key: "ADVECTION_ITERATIONS", label: "Advection Iterations", description: "Number of saltation transport passes per simulation step. Each pass moves snow one grid cell downwind. More iterations = snow travels further from source (longer fetch distance). 12 iterations x 75m cells = ~900m max transport.", min: 1, max: 30, step: 1 },
      { key: "POWDER_TEMP_MIN", label: "Powder Temp Min (C)", description: "Lower temperature bound for the powder survival zone. Below this, snow is cold enough to stay dry and light. Used to identify where untracked powder is most likely to persist.", min: -30, max: 0, step: 1 },
      { key: "POWDER_TEMP_MAX", label: "Powder Temp Max (C)", description: "Upper temperature bound for powder survival. Above this, snow grains bond and sinter — powder quality degrades. The range between min and max defines the 'sweet spot' for powder skiing.", min: -20, max: 0, step: 1 },
      { key: "SKIABLE_SLOPE_MIN", label: "Skiable Slope Min (deg)", description: "Minimum slope angle considered skiable terrain. Flatter slopes are excluded from powder zone detection. 25° is a moderate pitch — good for powder turns.", min: 10, max: 40, step: 1 },
      { key: "SKIABLE_SLOPE_MAX", label: "Skiable Slope Max (deg)", description: "Maximum slope angle considered skiable. Steeper terrain is excluded (cliff/avalanche terrain). 45° is very steep — expert-only. Increase for extreme skiing analysis.", min: 30, max: 60, step: 1 },
    ],
  },
  {
    name: "Historical Simulation",
    sliders: [
      { key: "SNOW_WATER_RATIO", label: "Snow:Water Ratio", description: "Converts precipitation (mm water) to snow depth (mm). Default 10:1 means 1mm rain = 10mm snow = 1cm. Cold dry powder can be 15-20:1. Wet heavy snow is 5-8:1. This directly scales how much snow accumulates from each weather timestep.", min: 5, max: 20, step: 1 },
      { key: "MELT_DEGREE_FACTOR", label: "Melt Degree Factor", description: "Degree-day melt rate: mm water equivalent melted per °C above freezing per 3h step. At 0.5, a 4°C warm spell melts 2mm SWE per 3h step. Higher values = faster melt in warm periods. Literature range: 0.3-1.5 depending on solar exposure.", min: 0.1, max: 2.0, step: 0.1 },
      { key: "RAIN_MELT_FACTOR", label: "Rain Melt Factor", description: "Additional melt caused by rain falling on snow, per mm of rain. Rain transfers heat to the snowpack. At 0.2, a 5mm rain event melts an extra 1mm SWE beyond temperature-driven melt.", min: 0.0, max: 1.0, step: 0.05 },
      { key: "SUB_STEPS", label: "Sub-Steps", description: "Number of simulation sub-steps per 3h weather interval. 4 sub-steps = 45-minute resolution. Higher values give smoother snow redistribution within each weather period but increase computation time proportionally.", min: 1, max: 12, step: 1 },
      { key: "WIND_DIR_CHANGE_THRESHOLD", label: "Wind Dir Threshold (deg)", description: "Minimum wind direction change (degrees) before re-solving the full wind field. The solver is expensive, so small direction shifts reuse the previous solution. Lower = more wind solves = more accurate but slower.", min: 5, max: 45, step: 5 },
      { key: "WIND_SPEED_CHANGE_THRESHOLD", label: "Wind Speed Threshold (m/s)", description: "Minimum wind speed change (m/s) before re-solving. Combined with direction threshold to decide when wind field cache is invalidated. Lower = more frequent re-solves.", min: 0.5, max: 10, step: 0.5 },
    ],
  },
  {
    name: "Weather Downscaling",
    sliders: [
      { key: "LAPSE_RATE", label: "Lapse Rate (C/m)", description: "Temperature change per meter of elevation gain. Standard atmosphere is -6.5°C/km (-0.0065/m). More negative = stronger cooling with altitude. This determines whether high peaks get snow while valleys get rain during the same storm.", min: -0.01, max: -0.003, step: 0.0005 },
      { key: "PRECIP_ELEV_FACTOR", label: "Precip Elevation Factor", description: "Orographic precipitation enhancement per meter above reference altitude. At 0.0008 (default 8%/100m), a peak 500m above the station gets 40% more precipitation. Models how mountains force air upward, increasing snowfall at higher elevations.", min: 0.0, max: 0.003, step: 0.0001 },
    ],
  },
];
