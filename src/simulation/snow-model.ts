import type { ElevationGrid } from "../types/terrain.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import { clamp, smoothstep } from "../utils/math.ts";

const BASE_SNOWFALL_CM = 30;
const KARMAN_DRAG_COEFF = 0.04;
const POWDER_TEMP_MIN = -10;
const POWDER_TEMP_MAX = -5;
const SKIABLE_SLOPE_MIN = 25;
const SKIABLE_SLOPE_MAX = 45;
const ADVECTION_ITERATIONS = 12;

// Li & Pomeroy 1997 — friction velocity threshold by temperature
function thresholdFrictionVelocity(tempC: number): number {
  if (tempC > 0) return 1.0;     // wet snow barely moves
  if (tempC > -3) return 0.48;   // moist snow
  if (tempC > -10) return 0.28;  // settled cold snow
  return 0.16;                    // fresh dry powder
}

// 10m wind speed threshold (for powder detection)
function thresholdWindSpeed(tempC: number): number {
  if (tempC > 0) return 25;
  if (tempC > -3) return 12;
  if (tempC > -10) return 7;
  return 4;
}

// 2D saltation advection: snow physically moves downwind from ridges to lee slopes
function advectSaltation(
  terrain: ElevationGrid,
  wind: WindField,
  params: WindParams,
  snowfallCm: number,
): Float64Array {
  const { rows, cols, heights, slopes, cellSizeMeters } = terrain;
  const n = rows * cols;

  // Start with uniform snowfall on land
  const snow = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (heights[i] >= 40) snow[i] = snowfallCm;
  }

  // No redistribution at calm wind
  if (params.speed < 0.5) return snow;

  const massInTransport = new Float64Array(n);
  const uStarTh = thresholdFrictionVelocity(params.temperature);
  const windStrength = smoothstep(0, 2, params.speed);

  for (let iter = 0; iter < ADVECTION_ITERATIONS; iter++) {
    // 1. Erosion & deposition per cell
    for (let i = 0; i < n; i++) {
      if (heights[i] < 40) continue;

      const speed = Math.sqrt(wind.u[i] ** 2 + wind.v[i] ** 2);
      const uStar = speed * KARMAN_DRAG_COEFF;

      // Erosion: Pomeroy flux, fetch-limited (only erode when below equilibrium transport)
      if (uStar > uStarTh && snow[i] > 0.1) {
        const equilibrium = uStar * (uStar * uStar - uStarTh * uStarTh);
        const deficit = Math.max(0, equilibrium - massInTransport[i]);
        const eroded = Math.min(deficit * 0.25 * windStrength, snow[i] * 0.2);
        snow[i] -= eroded;
        massInTransport[i] += eroded;
      }

      // Deposition: in sheltered areas (positive Sx)
      const sx = wind.exposure[i];
      if (sx > 0.01 && massInTransport[i] > 0.01) {
        const depRate = clamp(sx * 5, 0, 0.35);
        const deposited = massInTransport[i] * depRate;
        snow[i] += deposited;
        massInTransport[i] -= deposited;
      }

      // Slope shedding: steep slopes shed deposited snow
      const slopeDeg = slopes[i] * (180 / Math.PI);
      if (slopeDeg > 40 && snow[i] > snowfallCm) {
        const excess = (snow[i] - snowfallCm) * smoothstep(40, 55, slopeDeg) * 0.3;
        snow[i] -= excess;
        massInTransport[i] += excess * 0.5; // half re-enters transport, half lost
      }
    }

    // 2. Advect transport mass downwind (first-order upwind scheme)
    const newTransport = new Float64Array(n);
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c;
        if (massInTransport[i] < 0.001) continue;

        const wu = wind.u[i];
        const wv = wind.v[i];
        const speed = Math.sqrt(wu * wu + wv * wv);
        if (speed < 0.1) {
          newTransport[i] += massInTransport[i];
          continue;
        }

        const dt = cellSizeMeters / (speed + 1);
        const courant = clamp(speed * dt / cellSizeMeters, 0, 0.9);

        // Upwind source: where is transport coming FROM
        const srcC = wu > 0 ? c - 1 : c + 1;
        const srcR = wv > 0 ? r - 1 : r + 1;

        if (srcC >= 0 && srcC < cols && srcR >= 0 && srcR < rows) {
          const srcI = srcR * cols + srcC;
          newTransport[i] += massInTransport[i] * (1 - courant)
                          + massInTransport[srcI] * courant;
        } else {
          newTransport[i] += massInTransport[i];
        }
      }
    }

    // 3. Sublimation loss during transport (2-5% per iteration)
    const sublimRate = clamp(0.02 + 0.003 * params.speed, 0, 0.05);
    for (let i = 0; i < n; i++) {
      newTransport[i] *= (1 - sublimRate);
    }

    massInTransport.set(newTransport);
  }

  // Deposit remaining transport mass
  for (let i = 0; i < n; i++) {
    snow[i] += massInTransport[i];
  }

  return snow;
}

export function computeSnowAccumulation(
  terrain: ElevationGrid,
  wind: WindField,
  params: WindParams,
  snowfallCm = BASE_SNOWFALL_CM,
): SnowDepthGrid {
  const { rows, cols, slopes, heights } = terrain;
  const n = rows * cols;
  const isPowderZone = new Uint8Array(n);

  // No snow above freezing
  if (params.temperature > 1) {
    return { depth: new Float64Array(n), isPowderZone, rows, cols };
  }

  // Advection-based redistribution
  const depth = advectSaltation(terrain, wind, params, snowfallCm);

  // Powder zone detection: powder survives in sheltered, low-wind areas
  const inPowderTemp = params.temperature >= POWDER_TEMP_MIN && params.temperature <= POWDER_TEMP_MAX;
  if (inPowderTemp) {
    for (let i = 0; i < n; i++) {
      if (heights[i] < 40) continue;
      const slopeDeg = slopes[i] * (180 / Math.PI);
      const skiable = slopeDeg >= SKIABLE_SLOPE_MIN && slopeDeg <= SKIABLE_SLOPE_MAX;
      if (!skiable) continue;

      const surfaceSpeed = Math.sqrt(wind.u[i] ** 2 + wind.v[i] ** 2);
      const isWindLoaded = depth[i] > snowfallCm * 1.15; // received significant deposition
      const isLowWind = surfaceSpeed < thresholdWindSpeed(params.temperature) * 0.7;

      if (isLowWind && !isWindLoaded) {
        isPowderZone[i] = 1;
      }
    }
  }

  let minD = Infinity, maxD = -Infinity, landCells = 0;
  for (let i = 0; i < n; i++) {
    if (heights[i] < 40) continue;
    landCells++;
    if (depth[i] < minD) minD = depth[i];
    if (depth[i] > maxD) maxD = depth[i];
  }
  console.log(`Snow model: ${snowfallCm}cm base, ${landCells} land cells, depth range: ${minD.toFixed(1)}-${maxD.toFixed(1)}cm`);

  return { depth, isPowderZone, rows, cols };
}
