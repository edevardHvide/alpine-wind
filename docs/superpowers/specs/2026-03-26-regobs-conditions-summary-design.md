# RegObs Conditions Summary — Design Spec

## Overview

Add an AI-powered conditions summary to the snow depth tooltip. When a user clicks a point in simulation mode, they see the existing depth/weather data instantly. An "Analyze conditions" button fetches nearby RegObs field observations and Varsom avalanche forecasts, scores them for relevance to the clicked terrain, sends them to a Claude-powered Lambda, and appends a structured summary below the existing tooltip content.

## Data Flow

1. User clicks point in sim mode -> existing probe fires (instant depth, elevation, weather)
2. Tooltip displays with existing data + "Analyze conditions" button
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

### Inputs

- Clicked point: lat, lng, elevation, aspect (radians), slope

**Note:** The main thread terrain grid has empty arrays for slopes/aspects/Sx — these are computed only in the Web Worker. At probe time, compute aspect and slope for the clicked cell on the main thread using central finite differences on the 4 neighboring height values (same math as `computeDerivatives` in `terrain-processing.ts`, just for 1 cell). This is a few lines and runs in microseconds.

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

- `GET https://api.varsom.no/RegionSummary/Detail/{lat}/{lon}/{lang}/{from}/{to}` (lang=1 for Norwegian, 2 for English; dates as `YYYY-MM-DD`)
- Returns: danger level, avalanche problems, mountain weather summary
- No auth required. CORS support needs verification during implementation — if Varsom blocks browser-origin requests, proxy through the existing API Gateway (add a route like the NVE proxy)
- localStorage cache: 1-hour TTL, keyed by coordinates + date range

## Lambda + Infrastructure

### New Lambda — `infra/lambda/conditions_summary.py`

- Receives POST: clicked point characteristics, scored observations array, Varsom forecast
- Builds structured prompt (system + user message)
- Calls Claude via raw HTTP POST to `https://api.anthropic.com/v1/messages` using `urllib` (stdlib only — no Anthropic SDK needed, keeps the same packaging pattern as the NVE proxy: single `.py` file zipped)
- Model: `claude-haiku-4-5-20251001`, `max_tokens: 1024` (bounds per-request cost)
- Returns summary as JSON
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
- Scored observations (sorted by relevance, trimmed to only fields Claude needs): relevance score, distance, elevation diff, aspect diff, hours since observation, observer competency, and extracted observation fields (drift category, snow surface type, danger signs, avalanche activity, free text comments). Raw RegObs response is parsed and trimmed browser-side before sending to Lambda to minimize prompt tokens.

### System prompt guidance

> You are an alpine conditions analyst for a specific terrain point. The user is looking at a [aspect]-facing slope at [elevation]m. Prioritize observations with high relevance scores and high observer competency. If the most relevant observations conflict, say so. If there are no observations above 0.5 relevance, clearly state that the assessment is based on limited nearby data and the regional forecast.

### Infrastructure (OpenTofu)

- New Lambda resource + IAM role (clone NVE proxy pattern)
- New API Gateway route: `POST /api/conditions-summary`
- Same API Gateway (`aws_apigatewayv2_api.nve_proxy`), same deployment
- Lambda timeout: 30s, memory: 128MB (stdlib-only, same as NVE proxy)
- API Gateway CORS: update `allow_methods` to include `POST` and `OPTIONS` (currently only allows `GET`)
- API Gateway throttling: 10 requests/second, 100 burst (prevents runaway Anthropic costs)
- Vite dev proxy: add `/api/conditions-summary` route targeting the deployed Lambda URL
- Production URL: same API Gateway base URL already used by `nve.ts` — share the constant

## UI Changes

### SnowDepthTooltip expansion

- "Analyze conditions" button below existing depth/weather content
- On click: button becomes "Analyzing conditions..." with small spinner
- On success: subtle divider, then summary sections appended below
- Summary sections: compact styled blocks (bold heading, body text) — no markdown parsing, structured JSON from Lambda mapped to JSX
- Tooltip becomes scrollable (`max-h` + `overflow-y-auto`) when expanded
- On error: button resets with "Could not load — try again"

### Mobile

- Expanded tooltip may anchor to bottom of screen (bottom sheet style) to avoid overflow
- "Analyze conditions" button gets larger touch target (20px, matching range slider pattern)

### Visibility gate

Button only appears in historical sim mode (same condition as depth probe).

## Edge Cases

- **No RegObs observations nearby:** Summary leans on Varsom forecast + sim wind/Sx data. States "No field observations available — assessment based on regional forecast only."
- **All observations low-relevance (<0.3):** Summary caveats: "Limited nearby data on similar terrain."
- **Contradicting high-relevance observations:** Claude flags the conflict rather than averaging.
- **Summer / no snow:** Button appears but summary says "No winter observations available for this period."
- **Observation outside loaded terrain grid:** Fall back to reported elevation, aspect factor = 0.5 (neutral).
- **Lambda timeout (30s):** User sees spinner then error with retry option.
- **User clicks elsewhere:** New click dismisses tooltip entirely (existing behavior), cancels in-flight request via `AbortController`. Store controller in a ref, abort on tooltip close or new click.

## Files to Create/Modify

### New files
- `src/api/regobs.ts` — RegObs API client
- `src/api/varsom.ts` — Varsom API client
- `src/utils/relevance.ts` — Relevance scoring module (+ single-cell aspect/slope computation)
- `src/types/conditions.ts` — TypeScript interfaces for RegObs parsed observations, Lambda request/response, relevance scoring
- `infra/lambda/conditions_summary.py` — Claude summary Lambda (stdlib-only, single file)

### Modified files
- `src/components/SnowDepthTooltip.tsx` — Add button, expanded state, summary display
- `src/App.tsx` — Wire up the analyse flow (fetch, score, call Lambda)
- `infra/apigateway.tf` — New POST route
- `infra/lambda.tf` — New Lambda resource + IAM
- `vite.config.ts` — Dev proxy for new route
- `CLAUDE.md` — Document the new feature
