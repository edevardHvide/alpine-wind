import {
  Cartographic,
  type CesiumTerrainProvider,
  sampleTerrainMostDetailed,
} from "cesium";
import type { BoundingBox, ElevationGrid } from "../types/terrain.ts";
import { gridDimensions, gridToLatLng } from "../utils/geo.ts";

const DEFAULT_CELL_SIZE = 75; // meters

export async function sampleTerrain(
  terrainProvider: CesiumTerrainProvider,
  bbox: BoundingBox,
  cellSizeMeters = DEFAULT_CELL_SIZE,
): Promise<ElevationGrid> {
  const { rows, cols } = gridDimensions(bbox, cellSizeMeters);

  // Build sample positions
  const positions: Cartographic[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { lat, lng } = gridToLatLng(r, c, bbox, rows, cols);
      positions.push(Cartographic.fromDegrees(lng, lat));
    }
  }

  // Query terrain heights in batches to avoid stack overflow with large grids
  const BATCH_SIZE = 10000;
  const heights = new Float64Array(rows * cols);
  for (let start = 0; start < positions.length; start += BATCH_SIZE) {
    const batch = positions.slice(start, start + BATCH_SIZE);
    const sampled = await sampleTerrainMostDetailed(terrainProvider, batch);
    for (let i = 0; i < sampled.length; i++) {
      heights[start + i] = sampled[i].height;
    }
  }

  // Compute slope, aspect, normals from finite differences
  const slopes = new Float64Array(rows * cols);
  const aspects = new Float64Array(rows * cols);
  const normalsX = new Float64Array(rows * cols);
  const normalsY = new Float64Array(rows * cols);
  const normalsZ = new Float64Array(rows * cols);

  computeDerivatives(heights, rows, cols, cellSizeMeters, slopes, aspects, normalsX, normalsY, normalsZ);

  console.log(
    `Terrain sampled: ${rows}x${cols} grid, cell=${cellSizeMeters}m, ` +
    `height range: ${typedArrayMin(heights).toFixed(0)}-${typedArrayMax(heights).toFixed(0)}m`,
  );

  return { heights, rows, cols, bbox, cellSizeMeters, slopes, aspects, normalsX, normalsY, normalsZ };
}

function typedArrayMin(arr: Float64Array): number {
  let min = Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] < min) min = arr[i];
  return min;
}

function typedArrayMax(arr: Float64Array): number {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  return max;
}

function computeDerivatives(
  heights: Float64Array,
  rows: number,
  cols: number,
  cellSize: number,
  slopes: Float64Array,
  aspects: Float64Array,
  nx: Float64Array,
  ny: Float64Array,
  nz: Float64Array,
): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;

      // Central finite differences (clamp at edges)
      const left = heights[r * cols + Math.max(0, c - 1)];
      const right = heights[r * cols + Math.min(cols - 1, c + 1)];
      const below = heights[Math.max(0, r - 1) * cols + c];
      const above = heights[Math.min(rows - 1, r + 1) * cols + c];

      const dzdx = (right - left) / (2 * cellSize);
      const dzdy = (above - below) / (2 * cellSize);

      // Slope angle in radians
      slopes[idx] = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));

      // Aspect: direction the slope faces (0=N, clockwise)
      aspects[idx] = Math.atan2(-dzdx, -dzdy);
      if (aspects[idx] < 0) aspects[idx] += 2 * Math.PI;

      // Surface normal (unnormalized: [-dzdx, -dzdy, 1], then normalize)
      const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      nx[idx] = -dzdx / len;
      ny[idx] = -dzdy / len;
      nz[idx] = 1 / len;
    }
  }
}

