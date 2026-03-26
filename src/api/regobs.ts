import type { RegObsObservation } from "../types/conditions";

const REGOBS_API = "https://api.regobs.no/v5/Search";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Round to 1 decimal for cache key stability */
function cacheKey(lat: number, lng: number): string {
  const d = new Date().toISOString().slice(0, 10);
  return `regobs_${lat.toFixed(1)}_${lng.toFixed(1)}_${d}`;
}

function getCache(key: string): RegObsObservation[] | null {
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

function setCache(key: string, data: RegObsObservation[]): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded -- ignore */ }
}

/**
 * Parse raw RegObs API response into our trimmed observation format.
 * The v5/Search response has deeply nested registration arrays.
 */
function parseObservations(raw: unknown[]): RegObsObservation[] {
  return raw.map((entry: any) => {
    const regs = entry.Registrations ?? [];
    const obs: RegObsObservation = {
      id: entry.RegId ?? 0,
      lat: entry.ObsLocation?.Latitude ?? 0,
      lng: entry.ObsLocation?.Longitude ?? 0,
      timestamp: entry.DtObsTime ?? "",
      competencyLevel: entry.Observer?.CompetencyLevel ?? 1,
      elevation: entry.ObsLocation?.Height,
      registrations: {},
    };

    for (const reg of regs) {
      const tid = reg.RegistrationTID;
      const full = reg.FullObject;
      if (!full) continue;

      // TID 33 = Snow drift observation
      if (tid === 33) {
        obs.registrations.driftObs = {
          driftCategory: full.DriftExtentName ?? full.DriftExtentTID?.toString() ?? "",
          comment: full.Comment,
        };
      }
      // TID 36 = Snow surface observation
      if (tid === 36) {
        obs.registrations.snowSurface = {
          surfaceType: full.SnowSurfaceName ?? full.SnowSurfaceTID?.toString() ?? "",
          comment: full.Comment,
        };
      }
      // TID 31 = Danger signs
      if (tid === 31) {
        const signs = (full.DangerSigns ?? []).map((s: any) => s.DangerSignName ?? s.DangerSignTID?.toString() ?? "");
        obs.registrations.dangerSigns = {
          signs,
          comment: full.Comment,
        };
      }
      // TID 26 = Avalanche activity (observed)
      if (tid === 26) {
        obs.registrations.avalancheActivity = {
          type: full.AvalancheName ?? full.AvalancheTID?.toString() ?? "",
          trigger: full.AvalancheTriggerName ?? full.AvalancheTriggerTID?.toString() ?? "",
          comment: full.Comment,
        };
      }
      // TID 13 = Weather observation
      if (tid === 13) {
        obs.registrations.weather = { comment: full.Comment };
      }
    }

    return obs;
  }).filter(o => o.lat !== 0 && o.lng !== 0);
}

/**
 * Fetch RegObs snow observations within radius of a point.
 * Returns parsed, trimmed observations. Cached for 1 hour.
 */
export async function fetchRegObsObservations(
  lat: number,
  lng: number,
  radiusKm: number = 30,
  daysBack: number = 7,
  signal?: AbortSignal,
): Promise<RegObsObservation[]> {
  const key = cacheKey(lat, lng);
  const cached = getCache(key);
  if (cached) return cached;

  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - daysBack * 24 * 60 * 60 * 1000);

  const body = {
    SelectedGeoHazards: [10], // Snow
    ObserverCompetence: [],
    FromDate: fromDate.toISOString(),
    ToDate: toDate.toISOString(),
    Radius: radiusKm * 1000, // API expects meters
    Latitude: lat,
    Longitude: lng,
    NumberOfRecords: 100,
    LangKey: 2, // English
  };

  const resp = await fetch(REGOBS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) throw new Error(`RegObs API error: ${resp.status}`);

  const raw = await resp.json();
  const observations = parseObservations(raw);
  setCache(key, observations);
  return observations;
}
