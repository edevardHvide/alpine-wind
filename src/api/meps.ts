// MEPS 2.5km wind data from MET Norway THREDDS via Lambda proxy.
// Provides 10m surface wind, 850hPa pressure-level wind, and gusts.
// Supports historical (archive) + forecast (latest) in a single request.

const API_BASE = "/api/meps-wind";

export interface MepsWindStation {
  lat: number;
  lng: number;
  timestamps: number[];       // epoch ms
  windSpeed10m: number[];     // m/s
  windDir10m: number[];       // degrees
  windSpeed850hPa: number[];  // m/s — free-atmosphere wind at ~1500m
  windDir850hPa: number[];    // degrees
  windGust: number[];         // m/s
}

export interface MepsWindResponse {
  sources: string[];
  model: string;
  stations: MepsWindStation[];
}

/**
 * Fetch MEPS wind for a grid of sample points (history + forecast).
 * Each point is fetched with mode=full: 7 days archive + 24h forecast.
 *
 * For 9 sample points, this makes 9 sequential Lambda calls (each ~7s).
 * To keep latency manageable, we batch points into the Lambda's multi-point
 * mode — but for historical mode each point makes ~14 THREDDS fetches,
 * so we split into smaller batches to stay under Lambda timeout.
 */
export async function fetchMepsWindGrid(
  samplePoints: { lat: number; lng: number }[],
  daysBack = 7,
  hoursForward = 24,
): Promise<MepsWindResponse> {
  // Fetch each point individually in parallel from the frontend
  // (Lambda does concurrent archive fetches internally per point,
  //  but multi-point x historical would exceed Lambda timeout)
  const results = await Promise.all(
    samplePoints.map(async (p) => {
      const url = `${API_BASE}?lat=${p.lat.toFixed(4)}&lng=${p.lng.toFixed(4)}&mode=full&daysBack=${daysBack}&hours=${hoursForward}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`MEPS wind fetch failed for (${p.lat}, ${p.lng}):`, res.status);
        return null;
      }
      const json: MepsWindResponse = await res.json();
      return json.stations[0] ?? null;
    }),
  );

  const stations = results.filter((s): s is MepsWindStation => s !== null);

  return {
    sources: ["meps_archive", "meps_latest"],
    model: "MEPS 2.5km",
    stations,
  };
}
