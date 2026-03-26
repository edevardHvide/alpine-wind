# RegObs Conditions Summary — Design Spec

## Overview

Add an AI-powered conditions summary to the snow depth tooltip. When a user clicks a point in simulation mode, they see the existing depth/weather data instantly. An "Analyse conditions" button fetches nearby RegObs field observations and Varsom avalanche forecasts, scores them for relevance to the clicked terrain, sends them to a Claude-powered Lambda, and appends a structured summary below the existing tooltip content.

## Data Flow

1. User clicks point in sim mode -> existing probe fires (instant depth, elevation, weather)
2. Tooltip displays with existing data + "Analyse conditions" button
3. Button click triggers (in parallel):
   - Browser fetches RegObs observations (7 days, 30km radius)
   - Browser fetches Varsom avalanche forecast for coordinates
4. Browser computes relevance score for each RegObs observation using terrain grid data
5. Filters to top 25 observations above 0.05 threshold
6. Browser POSTs scored observations + forecast + point characteristics to `/api/conditions-summary`
7. Lambda calls Claude with structured prompt, returns summary
8. Summary appends below existing tooltip content with divider

## Relevance Scoring

Pure browser-side function in `src/utils/relevance.ts`. Takes clicked point characteristics (all available from terrain grid) and an observation, returns a 0-1 score.

### Inputs from terrain grid (already loaded)

- Clicked point: lat, lng, elevation, aspect (radians), slope, Sx value

### Four dimensions (each 0 to 1)

**Aspect similarity** (most important):
```
score = (1 + cos(clickedAspect - obsAspect)) / 2
```
Same aspect = 1.0, opposite = 0.0, perpendicular = 0.5.

**Elevation similarity** (Gaussian decay, sigma = 300m):
```
score = exp(-dElev^2 / (2 * 300^2))
```
Same elevation = 1.0, 200m diff ~ 0.7, 500m diff ~ 0.2.

**Recency** (exponential decay, half-life = 24h):
```
score = exp(-hoursAgo * ln2 / 24)
```
3h ago ~ 0.9, 24h ~ 0.5, 3 days ~ 0.15, 7 days ~ 0.02.

**Proximity** (Gaussian decay, sigma = 15km):
```
score = exp(-distKm^2 / (2 * 15^2))
```

### Combined score

```
relevance = aspect^1.5 * elevation^1.2 * recency^1.0 * proximity^0.7
```

Exponents encode priority: aspect > elevation > recency > proximity.

### Observation aspect/elevation derivation

Map observation lat/lng to nearest terrain grid cell to get aspect and elevation. If the observation falls outside the loaded grid, fall back to reported elevation (if available) and set aspect factor to 0.5 (neutral).

## External APIs (Browser-side)

### RegObs API — `src/api/regobs.ts`

- `POST https://api.regobs.no/v5/Search`
- Body: coordinates, radius 30km, last 7 days, `SelectedGeoHazards: [10]` (snow)
- Returns: lat/lng, timestamp, observer competency (1-5), registration types (danger signs, avalanche activity, snow surface, weather, drift observations)
- No auth required, CORS-enabled, direct fetch
- localStorage cache: 1-hour TTL, keyed by rounded lat/lng + date

### Varsom API — `src/api/varsom.ts`

- `GET https://api.varsom.no/RegionSummary/Detail/{lat}/{lon}/2/{from}/{to}`
- Returns: danger level, avalanche problems, mountain weather summary
- No auth required, CORS-enabled
- localStorage cache: 1-hour TTL, keyed by coordinates + date range

## Lambda + Infrastructure

### New Lambda — `infra/lambda/conditions_summary.py`

- Receives POST: clicked point characteristics, scored observations array, Varsom forecast
- Builds structured prompt (system + user message)
- Calls Anthropic Python SDK with `claude-haiku-4-5-20251001`
- Returns summary as JSON
- ~50 lines, `anthropic` as only dependency
- API key from Lambda env var (`ANTHROPIC_API_KEY`)

### System prompt structure

Instructs Claude to return 4 sections:

1. **Wind & snow transport** — drift conditions at this aspect/elevation
2. **Surface conditions** — snow surface based on similar-aspect observations
3. **Stability concerns** — danger signs, wind slab, avalanche activity
4. **Confidence** — high/medium/low + data basis (N observations, max relevance, most recent)

### Prompt context includes

- Clicked point: lat, lon, elevation, aspect, slope angle, Sx exposure value
- Varsom regional forecast: danger level, avalanche problems, mountain weather
- Scored observations (sorted by relevance): relevance score, distance, elevation diff, aspect diff, hours since observation, observer competency, observation data

### System prompt guidance

> You are an alpine conditions analyst for a specific terrain point. The user is looking at a [aspect]-facing slope at [elevation]m. Prioritize observations with high relevance scores and high observer competency. If the most relevant observations conflict, say so. If there are no observations above 0.5 relevance, clearly state that the assessment is based on limited nearby data and the regional forecast.

### Infrastructure (OpenTofu)

- New Lambda resource + IAM role (clone NVE proxy pattern)
- New API Gateway route: `POST /api/conditions-summary`
- Same API Gateway (`aws_apigatewayv2_api.nve_proxy`), same deployment
- Lambda timeout: 30s, memory: 256MB (Anthropic SDK needs more than the 128MB NVE proxy)
- Vite dev proxy: add `/api/conditions-summary` route

## UI Changes

### SnowDepthTooltip expansion

- "Analyse conditions" button below existing depth/weather content
- On click: button becomes "Analysing conditions..." with small spinner
- On success: subtle divider, then summary sections appended below
- Summary sections: compact styled blocks (bold heading, body text) — no markdown parsing, structured JSON from Lambda mapped to JSX
- Tooltip becomes scrollable (`max-h` + `overflow-y-auto`) when expanded
- On error: button resets with "Could not load — try again"

### Mobile

- Expanded tooltip may anchor to bottom of screen (bottom sheet style) to avoid overflow
- "Analyse conditions" button gets larger touch target (20px, matching range slider pattern)

### Visibility gate

Button only appears in historical sim mode (same condition as depth probe).

## Edge Cases

- **No RegObs observations nearby:** Summary leans on Varsom forecast + sim wind/Sx data. States "No field observations available — assessment based on regional forecast only."
- **All observations low-relevance (<0.3):** Summary caveats: "Limited nearby data on similar terrain."
- **Contradicting high-relevance observations:** Claude flags the conflict rather than averaging.
- **Summer / no snow:** Button appears but summary says "No winter observations available for this period."
- **Observation outside loaded terrain grid:** Fall back to reported elevation, aspect factor = 0.5 (neutral).
- **Lambda timeout (30s):** User sees spinner then error with retry option.
- **User clicks elsewhere:** New click dismisses tooltip entirely (existing behavior), cancels in-flight request.

## Files to Create/Modify

### New files
- `src/api/regobs.ts` — RegObs API client
- `src/api/varsom.ts` — Varsom API client
- `src/utils/relevance.ts` — Relevance scoring module
- `infra/lambda/conditions_summary.py` — Claude summary Lambda

### Modified files
- `src/components/SnowDepthTooltip.tsx` — Add button, expanded state, summary display
- `src/App.tsx` — Wire up the analyse flow (fetch, score, call Lambda)
- `infra/apigateway.tf` — New POST route
- `infra/lambda.tf` — New Lambda resource + IAM
- `vite.config.ts` — Dev proxy for new route
