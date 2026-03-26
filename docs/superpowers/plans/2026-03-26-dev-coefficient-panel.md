# Dev Coefficient Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dev-only right-side panel that exposes all simulation coefficients as labeled sliders with descriptions, an Apply button to re-run the simulation, Reset to restore defaults, and Copy Settings to export changed values as JSON.

**Architecture:** `coefficients.ts` gets a `DEFAULTS` record and `CoefficientsOverride` type. The worker protocol gains an optional `overrides` field on `run-simulation`. Physics functions (`solveWindField`, `computeSnowAccumulation`) accept an optional overrides param, destructured with defaults. A new `DevCoefficientPanel` component renders sliders grouped by category. `useDevMode` hook manages URL-param activation and keyboard toggle.

**Tech Stack:** React, TypeScript, Tailwind CSS (glass-panel styling matching existing UI)

**Spec:** `docs/superpowers/specs/2026-03-26-dev-coefficient-panel-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/simulation/coefficients.ts` | Add `DEFAULTS` record, `CoefficientsOverride` type, slider metadata |
| Modify | `src/simulation/worker-protocol.ts` | Add optional `overrides` to `RunSimulationMessage` |
| Modify | `src/simulation/simulation.worker.ts` | Pass overrides through to physics functions |
| Modify | `src/simulation/wind-solver.ts` | Accept optional overrides param in `solveWindField` |
| Modify | `src/simulation/snow-model.ts` | Accept optional overrides param in `computeSnowAccumulation` and `advectSaltation` |
| Modify | `src/hooks/useSimulation.ts` | Pass overrides through `runSimulation` |
| Create | `src/hooks/useDevMode.ts` | URL param check + Ctrl+Shift+D keyboard toggle |
| Create | `src/components/DevCoefficientPanel.tsx` | Right-side drawer with grouped sliders, Apply/Reset/Copy |
| Modify | `src/App.tsx` | Wire up dev panel, pass overrides to simulation |

---

### Task 1: Add DEFAULTS record and CoefficientsOverride type to coefficients.ts

**Files:**
- Modify: `src/simulation/coefficients.ts`

- [ ] **Step 1: Add the DEFAULTS object and type at the bottom of coefficients.ts**

Append after the existing constants:

```typescript
// ── Runtime Override Support ────────────────────────────────────────

export const DEFAULTS = {
  // Wind Solver
  MAX_ITERATIONS,
  DIVERGENCE_THRESHOLD,
  RELAXATION_ALPHA,
  SURFACE_ROUGHNESS,
  REF_HEIGHT,
  // Snow Transport
  BASE_SNOWFALL_CM,
  KARMAN_DRAG_COEFF,
  ADVECTION_ITERATIONS,
  POWDER_TEMP_MIN,
  POWDER_TEMP_MAX,
  SKIABLE_SLOPE_MIN,
  SKIABLE_SLOPE_MAX,
  // Historical Simulation
  SNOW_WATER_RATIO,
  MELT_DEGREE_FACTOR,
  RAIN_MELT_FACTOR,
  SUB_STEPS,
  WIND_DIR_CHANGE_THRESHOLD,
  WIND_SPEED_CHANGE_THRESHOLD,
  // Weather Downscaling
  LAPSE_RATE,
  PRECIP_ELEV_FACTOR,
} as const;

export type CoefficientsOverride = Partial<typeof DEFAULTS>;
```

- [ ] **Step 2: Add slider metadata for the dev panel**

```typescript
export interface SliderMeta {
  key: keyof typeof DEFAULTS;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}

export const COEFFICIENT_GROUPS: { name: string; sliders: SliderMeta[] }[] = [
  {
    name: "Wind Solver",
    sliders: [
      { key: "MAX_ITERATIONS", label: "Max Iterations", description: "Gauss-Seidel iteration cap for mass conservation", min: 10, max: 500, step: 10 },
      { key: "DIVERGENCE_THRESHOLD", label: "Divergence Threshold", description: "Convergence check — lower = more accurate, slower", min: 0.001, max: 0.05, step: 0.001 },
      { key: "RELAXATION_ALPHA", label: "Relaxation Alpha", description: "Solver relaxation — higher = faster but less stable", min: 0.01, max: 0.5, step: 0.01 },
      { key: "SURFACE_ROUGHNESS", label: "Surface Roughness (z0)", description: "Terrain roughness length in meters — affects wind profile", min: 0.001, max: 0.5, step: 0.001 },
      { key: "REF_HEIGHT", label: "Reference Height", description: "Log-law wind profile reference height (meters)", min: 10, max: 200, step: 5 },
    ],
  },
  {
    name: "Snow Transport",
    sliders: [
      { key: "BASE_SNOWFALL_CM", label: "Base Snowfall (cm)", description: "Starting snowfall depth for manual mode", min: 5, max: 100, step: 1 },
      { key: "KARMAN_DRAG_COEFF", label: "Von Karman Drag", description: "Friction velocity: u* = wind speed x this", min: 0.01, max: 0.1, step: 0.005 },
      { key: "ADVECTION_ITERATIONS", label: "Advection Iterations", description: "Saltation passes per step — more = longer fetch", min: 1, max: 30, step: 1 },
      { key: "POWDER_TEMP_MIN", label: "Powder Temp Min (C)", description: "Coldest temp for powder survival", min: -30, max: 0, step: 1 },
      { key: "POWDER_TEMP_MAX", label: "Powder Temp Max (C)", description: "Warmest temp for powder survival", min: -20, max: 0, step: 1 },
      { key: "SKIABLE_SLOPE_MIN", label: "Skiable Slope Min (deg)", description: "Minimum skiable steepness", min: 10, max: 40, step: 1 },
      { key: "SKIABLE_SLOPE_MAX", label: "Skiable Slope Max (deg)", description: "Maximum skiable steepness", min: 30, max: 60, step: 1 },
    ],
  },
  {
    name: "Historical Simulation",
    sliders: [
      { key: "SNOW_WATER_RATIO", label: "Snow:Water Ratio", description: "mm water to mm snow conversion", min: 5, max: 20, step: 1 },
      { key: "MELT_DEGREE_FACTOR", label: "Melt Degree Factor", description: "Melt rate: mm water equiv per C per 3h step", min: 0.1, max: 2.0, step: 0.1 },
      { key: "RAIN_MELT_FACTOR", label: "Rain Melt Factor", description: "Additional melt per mm rain", min: 0.0, max: 1.0, step: 0.05 },
      { key: "SUB_STEPS", label: "Sub-Steps", description: "Sub-steps per 3h interval — higher = smoother", min: 1, max: 12, step: 1 },
      { key: "WIND_DIR_CHANGE_THRESHOLD", label: "Wind Dir Threshold (deg)", description: "Direction change before re-solving wind", min: 5, max: 45, step: 5 },
      { key: "WIND_SPEED_CHANGE_THRESHOLD", label: "Wind Speed Threshold (m/s)", description: "Speed change before re-solving wind", min: 0.5, max: 10, step: 0.5 },
    ],
  },
  {
    name: "Weather Downscaling",
    sliders: [
      { key: "LAPSE_RATE", label: "Lapse Rate (C/m)", description: "Temperature change per meter elevation gain", min: -0.01, max: -0.003, step: 0.0005 },
      { key: "PRECIP_ELEV_FACTOR", label: "Precip Elevation Factor", description: "Precipitation increase fraction per meter above reference", min: 0.0, max: 0.003, step: 0.0001 },
    ],
  },
];
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/simulation/coefficients.ts
git commit -m "feat: add DEFAULTS record, CoefficientsOverride type, and slider metadata"
```

---

### Task 2: Thread overrides through worker protocol and physics functions

**Files:**
- Modify: `src/simulation/worker-protocol.ts`
- Modify: `src/simulation/simulation.worker.ts`
- Modify: `src/simulation/wind-solver.ts`
- Modify: `src/simulation/snow-model.ts`

- [ ] **Step 1: Add overrides to RunSimulationMessage in worker-protocol.ts**

In `worker-protocol.ts`, add the import and optional field:

```typescript
import type { CoefficientsOverride } from "./coefficients.ts";

export interface RunSimulationMessage {
  type: "run-simulation";
  params: WindParams;
  overrides?: CoefficientsOverride;  // <-- add this
}
```

- [ ] **Step 2: Add optional overrides param to solveWindField in wind-solver.ts**

Change the function signature and destructure overrides at the top:

```typescript
import {
  LAYER_HEIGHTS,
  MAX_ITERATIONS,
  DIVERGENCE_THRESHOLD,
  RELAXATION_ALPHA,
  SURFACE_ROUGHNESS,
  REF_HEIGHT,
  type CoefficientsOverride,
} from "./coefficients.ts";

export function solveWindField(
  terrain: ElevationGrid,
  params: WindParams,
  overrides?: CoefficientsOverride,
): WindField {
  const maxIter = overrides?.MAX_ITERATIONS ?? MAX_ITERATIONS;
  const divThreshold = overrides?.DIVERGENCE_THRESHOLD ?? DIVERGENCE_THRESHOLD;
  const relaxAlpha = overrides?.RELAXATION_ALPHA ?? RELAXATION_ALPHA;
  const surfRough = overrides?.SURFACE_ROUGHNESS ?? SURFACE_ROUGHNESS;
  const refH = overrides?.REF_HEIGHT ?? REF_HEIGHT;
```

Then replace all uses in the function body:
- `MAX_ITERATIONS` → `maxIter` (line 92 for-loop)
- `DIVERGENCE_THRESHOLD` → `divThreshold` (line 96 break check)
- `SURFACE_ROUGHNESS` → `surfRough` (line 69 log-profile)
- `REF_HEIGHT` → `refH` (line 69 log-profile)

Also pass `relaxAlpha` to `enforceMassConservation` — change its signature to accept it as a param:

```typescript
function enforceMassConservation(
  u: Float64Array, v: Float64Array, w: Float64Array,
  rows: number, cols: number, layers: number,
  cellSize: number,
  relaxAlpha: number = RELAXATION_ALPHA,
): number {
```

And in the call site: `enforceMassConservation(u, v, w, rows, cols, layers, terrain.cellSizeMeters, relaxAlpha)`

Replace `RELAXATION_ALPHA` references inside `enforceMassConservation` with the `relaxAlpha` parameter.

- [ ] **Step 3: Add optional overrides param to computeSnowAccumulation and advectSaltation in snow-model.ts**

Add import:
```typescript
import { ..., type CoefficientsOverride } from "./coefficients.ts";
```

Change `advectSaltation` signature:
```typescript
function advectSaltation(
  terrain: ElevationGrid,
  wind: WindField,
  params: WindParams,
  snowfallCm: number | Float64Array,
  overrides?: CoefficientsOverride,
): Float64Array {
  const karman = overrides?.KARMAN_DRAG_COEFF ?? KARMAN_DRAG_COEFF;
  const advIter = overrides?.ADVECTION_ITERATIONS ?? ADVECTION_ITERATIONS;
```

Replace `KARMAN_DRAG_COEFF` → `karman` and `ADVECTION_ITERATIONS` → `advIter` in the function body.

Change `computeSnowAccumulation` signature:
```typescript
export function computeSnowAccumulation(
  terrain: ElevationGrid,
  wind: WindField,
  params: WindParams,
  snowfallCm: number | Float64Array = BASE_SNOWFALL_CM,
  overrides?: CoefficientsOverride,
): SnowDepthGrid {
  const powTempMin = overrides?.POWDER_TEMP_MIN ?? POWDER_TEMP_MIN;
  const powTempMax = overrides?.POWDER_TEMP_MAX ?? POWDER_TEMP_MAX;
  const skiSlopeMin = overrides?.SKIABLE_SLOPE_MIN ?? SKIABLE_SLOPE_MIN;
  const skiSlopeMax = overrides?.SKIABLE_SLOPE_MAX ?? SKIABLE_SLOPE_MAX;
```

Replace the constant references in powder zone detection. Pass `overrides` through to `advectSaltation`.

- [ ] **Step 4: Pass overrides in simulation.worker.ts**

In the `run-simulation` handler:
```typescript
else if (msg.type === "run-simulation") {
  if (!terrain) throw new Error("Terrain not initialized");
  const windField = solveWindField(terrain, msg.params, msg.overrides);
  const snowGrid = computeSnowAccumulation(terrain, windField, msg.params, undefined, msg.overrides);
```

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/simulation/worker-protocol.ts src/simulation/simulation.worker.ts src/simulation/wind-solver.ts src/simulation/snow-model.ts
git commit -m "feat: thread coefficient overrides through worker and physics functions"
```

---

### Task 3: Update useSimulation hook to support overrides

**Files:**
- Modify: `src/hooks/useSimulation.ts`

- [ ] **Step 1: Add overrides param to runSimulation**

```typescript
import type { CoefficientsOverride } from "../simulation/coefficients.ts";

// Change runSimulation callback:
const runSimulation = useCallback((params: WindParams, overrides?: CoefficientsOverride) => {
  const worker = workerRef.current;
  if (!worker || !terrainSentRef.current) return;

  setState((s) => ({ ...s, simulating: true }));
  worker.postMessage({ type: "run-simulation", params, overrides });
}, []);
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSimulation.ts
git commit -m "feat: pass coefficient overrides through useSimulation hook"
```

---

### Task 4: Create useDevMode hook

**Files:**
- Create: `src/hooks/useDevMode.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useEffect } from "react";

export function useDevMode() {
  const enabled = new URLSearchParams(window.location.search).has("dev");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);

  return { devEnabled: enabled, devVisible: visible, setDevVisible: setVisible };
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDevMode.ts
git commit -m "feat: add useDevMode hook with URL param and keyboard toggle"
```

---

### Task 5: Create DevCoefficientPanel component

**Files:**
- Create: `src/components/DevCoefficientPanel.tsx`

- [ ] **Step 1: Create the panel component**

```tsx
import { useState, useCallback } from "react";
import { DEFAULTS, COEFFICIENT_GROUPS, type CoefficientsOverride } from "../simulation/coefficients.ts";

interface Props {
  visible: boolean;
  onApply: (overrides: CoefficientsOverride) => void;
}

export default function DevCoefficientPanel({ visible, onApply }: Props) {
  const [values, setValues] = useState<Record<string, number>>({ ...DEFAULTS });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const handleChange = useCallback((key: string, val: number) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleReset = useCallback(() => {
    setValues({ ...DEFAULTS });
  }, []);

  const handleApply = useCallback(() => {
    // Build overrides: only include values that differ from defaults
    const overrides: CoefficientsOverride = {};
    for (const [key, val] of Object.entries(values)) {
      const k = key as keyof typeof DEFAULTS;
      if (val !== DEFAULTS[k]) {
        (overrides as Record<string, number>)[k] = val;
      }
    }
    onApply(overrides);
  }, [values, onApply]);

  const handleCopy = useCallback(() => {
    const changed: Record<string, number> = {};
    for (const [key, val] of Object.entries(values)) {
      const k = key as keyof typeof DEFAULTS;
      if (val !== DEFAULTS[k]) {
        changed[k] = val;
      }
    }
    const json = JSON.stringify(changed, null, 2);
    navigator.clipboard.writeText(json);
  }, [values]);

  const toggleGroup = useCallback((name: string) => {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const hasChanges = Object.entries(values).some(([key, val]) => {
    return val !== DEFAULTS[key as keyof typeof DEFAULTS];
  });

  if (!visible) return null;

  return (
    <div className="fixed top-0 right-0 h-full w-80 z-30 glass-panel border-l border-white/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white/90 tracking-wide uppercase">Dev Coefficients</h2>
          <span className="text-[10px] text-white/40 font-mono">Ctrl+Shift+D</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleApply}
            className="flex-1 px-3 py-1.5 rounded text-xs font-medium bg-sky-600/80 hover:bg-sky-500/80 text-white transition-colors"
          >
            Apply
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded text-xs font-medium bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleCopy}
            disabled={!hasChanges}
            className="px-3 py-1.5 rounded text-xs font-medium bg-white/10 hover:bg-white/20 text-white/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Copy changed values as JSON"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Scrollable coefficient groups */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {COEFFICIENT_GROUPS.map((group) => (
          <div key={group.name}>
            <button
              onClick={() => toggleGroup(group.name)}
              className="w-full flex items-center justify-between py-1.5 text-xs font-semibold text-white/70 uppercase tracking-wide hover:text-white/90 transition-colors"
            >
              <span>{group.name}</span>
              <span className="text-white/40">{collapsed[group.name] ? "+" : "-"}</span>
            </button>
            {!collapsed[group.name] && (
              <div className="space-y-3 pb-3">
                {group.sliders.map((slider) => {
                  const val = values[slider.key];
                  const isChanged = val !== DEFAULTS[slider.key];
                  return (
                    <div key={slider.key}>
                      <div className="flex items-baseline justify-between mb-0.5">
                        <label className={`text-[11px] font-medium ${isChanged ? "text-sky-300" : "text-white/60"}`}>
                          {slider.label}
                        </label>
                        <span className={`text-[11px] font-mono ${isChanged ? "text-sky-300" : "text-white/50"}`}>
                          {val}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/35 mb-1 leading-tight">{slider.description}</p>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        step={slider.step}
                        value={val}
                        onChange={(e) => handleChange(slider.key, parseFloat(e.target.value))}
                        className="w-full h-1 appearance-none rounded bg-white/10 accent-sky-500 cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/DevCoefficientPanel.tsx
git commit -m "feat: add DevCoefficientPanel component with grouped sliders"
```

---

### Task 6: Wire up in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import new modules**

Add at the top of App.tsx:
```typescript
import DevCoefficientPanel from "./components/DevCoefficientPanel.tsx";
import { useDevMode } from "./hooks/useDevMode.ts";
import type { CoefficientsOverride } from "./simulation/coefficients.ts";
```

- [ ] **Step 2: Add dev mode state inside the App component**

Near the other hooks:
```typescript
const { devEnabled, devVisible } = useDevMode();
const devOverridesRef = useRef<CoefficientsOverride>({});
```

- [ ] **Step 3: Add handleDevApply callback**

```typescript
const handleDevApply = useCallback((overrides: CoefficientsOverride) => {
  devOverridesRef.current = overrides;
  runSimulation(params, overrides);
}, [params, runSimulation]);
```

- [ ] **Step 4: Render DevCoefficientPanel**

Add alongside the other overlay components (before closing `</>`):
```tsx
{devEnabled && (
  <DevCoefficientPanel
    visible={devVisible}
    onApply={handleDevApply}
  />
)}
```

- [ ] **Step 5: Type check and verify dev server runs**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npm run dev` and open `http://localhost:5173/?dev=true`, press Ctrl+Shift+D
Expected: panel slides in from right with all coefficient groups

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire DevCoefficientPanel into App with dev mode gating"
```

---

### Task 7: Merge coefficients branch and final verification

- [ ] **Step 1: Merge the coefficients extraction branch first**

The worktree at `.worktrees/coefficients` has the `feature/centralize-coefficients` branch with the initial extraction. Merge it into the current working branch (or main) before this work, since all tasks above assume `coefficients.ts` already exists.

```bash
git merge feature/centralize-coefficients
```

- [ ] **Step 2: Full build check**

Run: `npm run build`
Expected: clean build, no errors

- [ ] **Step 3: Manual test**

1. Open `http://localhost:5173/?dev=true`
2. Press Ctrl+Shift+D — panel appears on right
3. Search a mountain, let terrain load
4. Adjust BASE_SNOWFALL_CM slider to 60
5. Click Apply — simulation re-runs with 60cm snowfall
6. Click Reset — all sliders return to defaults
7. Change a few values, click Copy — paste in text editor, verify JSON
8. Open without `?dev=true` — no panel, Ctrl+Shift+D does nothing
