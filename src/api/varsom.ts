import type { VarsomForecast } from "../types/conditions";

const VARSOM_API = "https://api.varsom.no/RegionSummary/Detail";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(lat: number, lng: number): string {
  const d = new Date().toISOString().slice(0, 10);
  return `varsom_${lat.toFixed(2)}_${lng.toFixed(2)}_${d}`;
}

function getCache(key: string): VarsomForecast | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(key: string, data: VarsomForecast): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded */ }
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch Varsom avalanche forecast for coordinates.
 * Falls back to null if the API is unavailable or returns no data.
 */
export async function fetchVarsomForecast(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<VarsomForecast | null> {
  const key = cacheKey(lat, lng);
  const cached = getCache(key);
  if (cached) return cached;

  const today = new Date();
  const endDate = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
  const url = `${VARSOM_API}/${lat.toFixed(4)}/${lng.toFixed(4)}/2/${formatDate(today)}/${formatDate(endDate)}`;

  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) return null;

    const data = await resp.json();
    const latest = Array.isArray(data) ? data[0] : data;
    if (!latest) return null;

    const forecast: VarsomForecast = {
      dangerLevel: latest.DangerLevel ?? 0,
      dangerLevelName: latest.DangerLevelName ?? "Unknown",
      avalancheProblems: (latest.AvalancheProblems ?? []).map((p: any) => p.AvalancheProblemTypeName ?? ""),
      mountainWeather: latest.MountainWeather?.Comment ?? "",
      validFrom: latest.ValidFrom ?? "",
      validTo: latest.ValidTo ?? "",
    };

    setCache(key, forecast);
    return forecast;
  } catch {
    return null;
  }
}
