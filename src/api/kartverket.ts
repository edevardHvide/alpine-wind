const API_BASE = "https://ws.geonorge.no/stedsnavn/v1/sted";

export interface PlaceResult {
  name: string;
  type: string;
  municipality: string;
  lat: number;
  lng: number;
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
