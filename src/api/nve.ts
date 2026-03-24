// In dev: Vite proxy handles CORS. In prod: API Gateway proxies to NVE.
const NVE_PROXY_URL = "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com";
const API_BASE = import.meta.env.DEV
  ? "/api/nve/GridTimeSeries"
  : `${NVE_PROXY_URL}/api/nve/GridTimeSeries`;

export interface WeatherTimeSeries {
  timestamps: Date[];
  precip: number[];    // mm per 3h
  temp: number[];      // °C
  windSpeed: number[]; // m/s
  windDir: number[];   // degrees
  altitude: number;    // m
}

export interface WeatherStation {
  lat: number;
  lng: number;
  altitude: number;
  temp: number[];
  precip: number[];
  windSpeed: number[];
  windDir: number[];
}

export interface SpatialWeatherTimeSeries {
  timestamps: Date[];
  stations: WeatherStation[];
}

// WGS84 lat/lng → UTM Zone 33N (EPSG:32633)
export function latLngToUtm33(lat: number, lng: number): { x: number; y: number } {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const n = f / (2 - f);
  const k0 = 0.9996;
  const lon0 = 15.0; // central meridian zone 33

  const latR = (lat * Math.PI) / 180;
  const lonR = (lng * Math.PI) / 180;
  const lon0R = (lon0 * Math.PI) / 180;

  const A = (a / (1 + n)) * (1 + n * n / 4 + (n * n * n * n) / 64);

  const alpha1 = n / 2 - (2 * n * n) / 3 + (5 * n * n * n) / 16;
  const alpha2 = (13 * n * n) / 48 - (3 * n * n * n) / 5;

  const atanh_sin = Math.atanh(Math.sin(latR));
  const correction = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(atanh_sin - correction * Math.atanh(correction * Math.sin(latR)));
  const xiPrime = Math.atan2(t, Math.cos(lonR - lon0R));
  const etaPrime = Math.atanh(Math.sin(lonR - lon0R) / Math.sqrt(1 + t * t));

  const xi = xiPrime
    + alpha1 * Math.sin(2 * xiPrime) * Math.cosh(2 * etaPrime)
    + alpha2 * Math.sin(4 * xiPrime) * Math.cosh(4 * etaPrime);
  const eta = etaPrime
    + alpha1 * Math.cos(2 * xiPrime) * Math.sinh(2 * etaPrime)
    + alpha2 * Math.cos(4 * xiPrime) * Math.sinh(4 * etaPrime);

  return {
    x: Math.round(k0 * A * eta + 500000),
    y: Math.round(k0 * A * xi),
  };
}

async function fetchTheme(
  x: number, y: number, start: string, end: string, theme: string,
): Promise<{ data: number[]; altitude: number }> {
  const url = `${API_BASE}/${x}/${y}/${start}/${end}/${theme}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NVE API error: ${res.status} for ${theme}`);
  const json = await res.json();
  // Replace NoDataValue with 0
  const noData = json.NoDataValue ?? 65535;
  const data = (json.Data as number[]).map((v) => (v === noData ? 0 : v));
  return { data, altitude: json.Altitude ?? 0 };
}

// Try fetching from center point, fall back to nearby offsets if center is ocean
async function findValidUtm(lat: number, lng: number): Promise<{ x: number; y: number }> {
  const offsets = [
    [0, 0], [0.01, 0], [-0.01, 0], [0, 0.02], [0, -0.02],
    [0.02, 0.02], [-0.02, 0.02], [0.02, -0.02], [-0.02, -0.02],
    [0.03, 0], [-0.03, 0], [0, 0.05], [0, -0.05],
  ];
  for (const [dlat, dlng] of offsets) {
    const { x, y } = latLngToUtm33(lat + dlat, lng + dlng);
    try {
      const url = `${API_BASE}/${x}/${y}/2026-01-01/2026-01-02/tm.json`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (!json.Error) {
          console.log(`NVE: valid cell at UTM (${x}, ${y}), offset (${dlat}, ${dlng})`);
          return { x, y };
        }
      }
    } catch { /* try next */ }
  }
  // Last resort: use center
  return latLngToUtm33(lat, lng);
}

export async function fetchWeatherTimeSeries(
  lat: number, lng: number, daysBack = 7, daysForward = 5,
  onProgress?: (stage: string, progress: number) => void,
): Promise<WeatherTimeSeries> {
  const { x, y } = await findValidUtm(lat, lng);

  const now = new Date();
  const start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  console.log(`NVE: fetching ${daysBack}d back + ${daysForward}d forward for UTM33 (${x}, ${y}), ${fmt(start)} to ${fmt(end)}`);

  let completed = 0;
  const total = 4;
  const trackFetch = async (theme: string, label: string) => {
    onProgress?.(label, (completed / total) * 100);
    const result = await fetchTheme(x, y, fmt(start), fmt(end), theme);
    completed++;
    onProgress?.(label, (completed / total) * 100);
    return result;
  };

  const [precip, temp, windSpeed, windDir] = await Promise.all([
    trackFetch("rr3h", "Fetching precipitation data..."),
    trackFetch("tm3h", "Fetching temperature data..."),
    trackFetch("windSpeed10m3h", "Fetching wind speed data..."),
    trackFetch("windDirection10m3h", "Fetching wind direction data..."),
  ]);

  // Build timestamps (3-hourly from start)
  const len = precip.data.length;
  const timestamps: Date[] = [];
  for (let i = 0; i < len; i++) {
    timestamps.push(new Date(start.getTime() + i * 3 * 60 * 60 * 1000));
  }

  console.log(`NVE: ${len} timesteps, altitude=${precip.altitude}m`);

  return {
    timestamps,
    precip: precip.data,
    temp: temp.data,
    windSpeed: windSpeed.data,
    windDir: windDir.data,
    altitude: precip.altitude,
  };
}

// ── Multi-point spatial weather fetch ────────────────

const GRID_SIZE = 3; // 3×3 = 9 sample stations across bbox

/** Fetch all 4 themes for a single station. Returns null if station fails. */
async function fetchStation(
  lat: number, lng: number, startStr: string, endStr: string,
): Promise<WeatherStation | null> {
  const { x, y } = latLngToUtm33(lat, lng);

  try {
    const [precip, temp, windSpeed, windDir] = await Promise.all([
      fetchTheme(x, y, startStr, endStr, "rr3h"),
      fetchTheme(x, y, startStr, endStr, "tm3h"),
      fetchTheme(x, y, startStr, endStr, "windSpeed10m3h"),
      fetchTheme(x, y, startStr, endStr, "windDirection10m3h"),
    ]);

    return {
      lat,
      lng,
      altitude: temp.altitude,
      temp: temp.data,
      precip: precip.data,
      windSpeed: windSpeed.data,
      windDir: windDir.data,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch weather from a grid of stations across the bounding box.
 * Falls back to center-only if fewer than 2 stations succeed.
 */
export async function fetchSpatialWeather(
  centerLat: number, centerLng: number,
  bboxWest: number, bboxSouth: number,
  bboxEast: number, bboxNorth: number,
  daysBack = 7, daysForward = 5,
  onProgress?: (stage: string, progress: number) => void,
): Promise<SpatialWeatherTimeSeries> {
  const now = new Date();
  const start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const startStr = fmt(start);
  const endStr = fmt(end);

  // Generate grid sample points across bbox
  // Inset by 10% to avoid edge effects (coastline at bbox edges)
  const latPad = (bboxNorth - bboxSouth) * 0.1;
  const lngPad = (bboxEast - bboxWest) * 0.1;
  const samplePoints: { lat: number; lng: number }[] = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const lat = (bboxSouth + latPad) + ((r + 0.5) / GRID_SIZE) * (bboxNorth - bboxSouth - 2 * latPad);
      const lng = (bboxWest + lngPad) + ((c + 0.5) / GRID_SIZE) * (bboxEast - bboxWest - 2 * lngPad);
      samplePoints.push({ lat, lng });
    }
  }

  console.log(`NVE spatial: fetching ${samplePoints.length} stations across bbox, ${startStr} to ${endStr}`);
  onProgress?.("Fetching weather stations...", 0);

  // Fetch all stations in parallel
  let completed = 0;
  const total = samplePoints.length;

  const stationPromises = samplePoints.map(async (pt) => {
    const station = await fetchStation(pt.lat, pt.lng, startStr, endStr);
    completed++;
    onProgress?.(`Fetching weather stations... (${completed}/${total})`, (completed / total) * 80);
    return station;
  });

  const results = await Promise.all(stationPromises);
  const validStations = results.filter((s): s is WeatherStation => s !== null);

  console.log(`NVE spatial: ${validStations.length}/${samplePoints.length} stations valid`);

  // Fallback: if too few stations, fetch center point as single station
  if (validStations.length < 2) {
    console.log("NVE spatial: too few stations, falling back to center-only");
    const centerStation = await fetchStation(centerLat, centerLng, startStr, endStr);
    if (!centerStation) {
      // Absolute fallback — use findValidUtm
      const single = await fetchWeatherTimeSeries(centerLat, centerLng, daysBack, daysForward, onProgress);
      return {
        timestamps: single.timestamps,
        stations: [{
          lat: centerLat,
          lng: centerLng,
          altitude: single.altitude,
          temp: single.temp,
          precip: single.precip,
          windSpeed: single.windSpeed,
          windDir: single.windDir,
        }],
      };
    }
    validStations.push(centerStation);
  }

  // Build timestamps from first station
  const len = validStations[0].temp.length;
  const timestamps: Date[] = [];
  for (let i = 0; i < len; i++) {
    timestamps.push(new Date(start.getTime() + i * 3 * 60 * 60 * 1000));
  }

  onProgress?.("Weather data loaded", 100);
  console.log(`NVE spatial: ${len} timesteps, ${validStations.length} stations`);

  return { timestamps, stations: validStations };
}
