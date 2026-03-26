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
export const BASE_SNOWFALL_CM = 30;
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
