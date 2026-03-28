const API_BASE = "https://ws.geonorge.no/stedsnavn/v1/sted";
const PUNKT_BASE = "https://ws.geonorge.no/stedsnavn/v1/punkt";

export interface PlaceResult {
  name: string;
  type: string;
  municipality: string;
  lat: number;
  lng: number;
}

/** Mountain types from Kartverket, ordered by visual importance */
const PEAK_TYPES = new Set([
  "Fjell", "Topp", "Fjellområde", "Vidde", "Rygg", "Berg", "Fjellside", "Fjellkant",
]);

/** High-importance types shown when zoomed out */
const MAJOR_PEAK_TYPES = new Set(["Fjell", "Fjellområde", "Vidde"]);

export interface PeakLabel {
  name: string;
  type: string;
  lat: number;
  lng: number;
  major: boolean; // true = show from far away
}

/**
 * Fetch mountain/peak names within a bounding box.
 * Uses /punkt endpoint with 5km radius tiles to cover the area.
 */
export async function fetchPeakLabels(bbox: {
  north: number; south: number; east: number; west: number;
}): Promise<PeakLabel[]> {
  const RADIUS = 5000; // max 5km per call
  // Approximate degrees per 5km at this latitude
  const latStep = RADIUS / 111_000;
  const midLat = (bbox.north + bbox.south) / 2;
  const lngStep = RADIUS / (111_000 * Math.cos(midLat * Math.PI / 180));

  // Generate grid of center points to tile the bbox
  const centers: { lat: number; lng: number }[] = [];
  for (let lat = bbox.south; lat <= bbox.north + latStep * 0.5; lat += latStep) {
    for (let lng = bbox.west; lng <= bbox.east + lngStep * 0.5; lng += lngStep) {
      centers.push({ lat, lng });
    }
  }

  // Fetch all tiles in parallel
  const results = await Promise.all(
    centers.map(async (c) => {
      try {
        const params = new URLSearchParams({
          nord: String(c.lat),
          ost: String(c.lng),
          koordsys: "4258",
          radius: String(RADIUS),
          treffPerSide: "500",
        });
        const res = await fetch(`${PUNKT_BASE}?${params}`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.navn ?? []) as Record<string, unknown>[];
      } catch {
        return [];
      }
    }),
  );

  // Deduplicate by name + coordinates and filter to peak types
  const seen = new Set<string>();
  const peaks: PeakLabel[] = [];

  for (const names of results) {
    for (const n of names) {
      const type = n.navneobjekttype as string;
      if (!PEAK_TYPES.has(type)) continue;

      const punkt = n.representasjonspunkt as { nord: number; øst: number };
      const stedsnavn = (n.stedsnavn as Array<{ skrivemåte: string }>)?.[0];
      const name = stedsnavn?.skrivemåte ?? "";
      if (!name) continue;

      const key = `${name}_${punkt.nord.toFixed(4)}_${punkt.øst.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      peaks.push({
        name,
        type,
        lat: punkt.nord,
        lng: punkt.øst,
        major: MAJOR_PEAK_TYPES.has(type),
      });
    }
  }

  return peaks;
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (query.length < 2) return [];

  // Append wildcard so partial names match (e.g. "Troll" → "Trolltinden")
  const sok = query.endsWith("*") ? query : `${query}*`;
  const params = new URLSearchParams({ sok, treffPerSide: "10" });

  try {
    const res = await fetch(`${API_BASE}?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    return (data.navn ?? []).map((n: Record<string, unknown>) => {
      const punkt = n.representasjonspunkt as { nord: number; øst: number };
      const stedsnavn = (n.stedsnavn as Array<{ skrivemåte: string }>)?.[0];
      const kommune = (n.kommuner as Array<{ kommunenavn: string }>)?.[0];
      return {
        name: stedsnavn?.skrivemåte ?? "?",
        type: n.navneobjekttype as string,
        municipality: kommune?.kommunenavn ?? "",
        lat: punkt.nord,
        lng: punkt.øst,
      };
    });
  } catch {
    return [];
  }
}
