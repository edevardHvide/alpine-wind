export interface WindParams {
  direction: number; // degrees, 0=N, 90=E, 180=S, 270=W
  speed: number; // m/s
  temperature: number; // celsius
}

export interface WindField {
  u: Float64Array; // east-west component (m/s)
  v: Float64Array; // north-south component (m/s)
  w: Float64Array; // vertical component (m/s)
  exposure: Float64Array; // Winstral Sx per cell (positive=sheltered, negative=exposed)
  rows: number;
  cols: number;
  layers: number;
  layerHeights: number[]; // AGL in meters
}
