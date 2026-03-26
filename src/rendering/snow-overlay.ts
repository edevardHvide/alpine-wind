import {
  Rectangle,
  SingleTileImageryProvider,
  type Viewer,
  type ImageryLayer,
} from "cesium";
import type { SnowDepthGrid } from "../types/snow.ts";
import type { ElevationGrid } from "../types/terrain.ts";
import { snowDepthColor, historicalSnowColor } from "./color-scales.ts";

const DEFAULT_CROSSFADE_MS = 300;
const MIN_CROSSFADE_MS = 80;
const MAX_CROSSFADE_MS = 400;

export interface ColorStats {
  mean: number;
  spread: number;
}

export function computeColorStats(
  depth: Float64Array,
  rows: number,
  cols: number,
  terrain: ElevationGrid,
): ColorStats {
  let sum = 0, count = 0;
  for (let i = 0; i < rows * cols; i++) {
    if (terrain.heights[i] >= 40 && depth[i] > 0.5) {
      sum += depth[i];
      count++;
    }
  }
  const mean = count > 0 ? sum / count : 0;
  let maxDev = 0;
  for (let i = 0; i < rows * cols; i++) {
    if (terrain.heights[i] >= 40 && depth[i] > 0.5) {
      maxDev = Math.max(maxDev, Math.abs(depth[i] - mean));
    }
  }
  return { mean, spread: Math.max(maxDev, 3) };
}

interface PrerenderedStep {
  stepIndex: number;
  provider: SingleTileImageryProvider;
}

export class SnowOverlayManager {
  private viewer: Viewer;
  private currentLayer: ImageryLayer | null = null;
  private fadingLayer: ImageryLayer | null = null;
  private fadeRaf: number | null = null;
  private _targetAlpha = 0.55;
  private renderGen = 0;
  private prerenderGen = 0;
  private prerendered: PrerenderedStep | null = null;
  private lastShowTime = 0;
  private rect: ReturnType<typeof Rectangle.fromDegrees> | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /**
   * Render snow overlay with crossfade transition (manual mode / one-off).
   */
  async render(
    snow: SnowDepthGrid,
    terrain: ElevationGrid,
    mode: "manual" | "historical" = "manual",
  ): Promise<void> {
    const gen = ++this.renderGen;
    this.prerenderGen++; // invalidate any in-flight prerender
    const canvas = this.paintCanvas(snow, terrain, mode);
    this.ensureRect(terrain);
    const provider = await SingleTileImageryProvider.fromUrl(
      canvas.toDataURL(),
      { rectangle: this.rect! },
    );

    if (gen !== this.renderGen) return;

    const newLayer = this.viewer.imageryLayers.addImageryProvider(provider);

    if (this.currentLayer) {
      this.crossfade(this.currentLayer, newLayer, DEFAULT_CROSSFADE_MS);
    } else {
      newLayer.alpha = this._targetAlpha;
    }

    this.currentLayer = newLayer;
  }

  /**
   * Show a historical step with adaptive crossfade.
   * Uses pre-rendered provider if available (instant), otherwise renders on demand.
   * Old layer stays fully visible until crossfade begins — no flash.
   */
  async showStep(
    stepIndex: number,
    snow: SnowDepthGrid,
    terrain: ElevationGrid,
    colorStats?: ColorStats,
  ): Promise<void> {
    const gen = ++this.renderGen;
    this.ensureRect(terrain);

    let provider: SingleTileImageryProvider;

    if (this.prerendered && this.prerendered.stepIndex === stepIndex) {
      // Pre-rendered — instant, no async work
      provider = this.prerendered.provider;
      this.prerendered = null;
    } else {
      // Not pre-rendered — render now
      this.prerenderGen++;
      const canvas = this.paintCanvas(snow, terrain, "historical", colorStats);
      provider = await SingleTileImageryProvider.fromUrl(
        canvas.toDataURL(),
        { rectangle: this.rect! },
      );
      if (gen !== this.renderGen) return;
    }

    const newLayer = this.viewer.imageryLayers.addImageryProvider(provider);

    // Adaptive crossfade: measure time since last showStep call
    const now = performance.now();
    const stepInterval = this.lastShowTime > 0 ? now - this.lastShowTime : 1000;
    this.lastShowTime = now;
    // Use ~60% of the step interval for crossfade, clamped to sensible range
    const fadeDuration = Math.max(MIN_CROSSFADE_MS, Math.min(MAX_CROSSFADE_MS, stepInterval * 0.6));

    if (this.currentLayer) {
      this.crossfade(this.currentLayer, newLayer, fadeDuration);
    } else {
      newLayer.alpha = this._targetAlpha;
    }

    this.currentLayer = newLayer;
  }

  /**
   * Pre-render a future step in the background.
   * Does NOT display anything — just prepares the provider for instant use by showStep().
   */
  async prerender(
    stepIndex: number,
    snow: SnowDepthGrid,
    terrain: ElevationGrid,
    colorStats?: ColorStats,
  ): Promise<void> {
    const gen = ++this.prerenderGen;
    this.ensureRect(terrain);
    const canvas = this.paintCanvas(snow, terrain, "historical", colorStats);
    const provider = await SingleTileImageryProvider.fromUrl(
      canvas.toDataURL(),
      { rectangle: this.rect! },
    );
    if (gen !== this.prerenderGen) return; // stale prerender
    this.prerendered = { stepIndex, provider };
  }

  remove(): void {
    this.cancelFade();
    this.prerenderGen++;
    this.prerendered = null;
    if (this.fadingLayer) {
      this.viewer.imageryLayers.remove(this.fadingLayer);
      this.fadingLayer = null;
    }
    if (this.currentLayer) {
      this.viewer.imageryLayers.remove(this.currentLayer);
      this.currentLayer = null;
    }
  }

  destroy(): void {
    this.remove();
  }

  private ensureRect(terrain: ElevationGrid): void {
    if (!this.rect) {
      const { bbox } = terrain;
      this.rect = Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north);
    }
  }

  private paintCanvas(
    snow: SnowDepthGrid,
    terrain: ElevationGrid,
    mode: "manual" | "historical",
    colorStats?: ColorStats,
  ): HTMLCanvasElement {
    // 1. Paint at grid resolution (1 pixel per cell)
    const raw = document.createElement("canvas");
    raw.width = snow.cols;
    raw.height = snow.rows;
    const rawCtx = raw.getContext("2d")!;
    const imageData = rawCtx.createImageData(snow.cols, snow.rows);

    // For historical mode, compute mean and spread for relative coloring
    let meanDepth = 0;
    let spreadDepth = 15;
    if (mode === "historical") {
      if (colorStats) {
        meanDepth = colorStats.mean;
        spreadDepth = colorStats.spread;
      } else {
        let sum = 0, count = 0;
        for (let i = 0; i < snow.rows * snow.cols; i++) {
          if (terrain.heights[i] >= 40 && snow.depth[i] > 0.5) {
            sum += snow.depth[i];
            count++;
          }
        }
        meanDepth = count > 0 ? sum / count : 0;
        // Spread = max absolute deviation from mean (clamped to reasonable range)
        let maxDev = 0;
        for (let i = 0; i < snow.rows * snow.cols; i++) {
          if (terrain.heights[i] >= 40 && snow.depth[i] > 0.5) {
            maxDev = Math.max(maxDev, Math.abs(snow.depth[i] - meanDepth));
          }
        }
        spreadDepth = Math.max(maxDev, 3); // at least 3cm spread to avoid div issues
      }
    }

    for (let r = 0; r < snow.rows; r++) {
      const canvasRow = snow.rows - 1 - r;
      for (let c = 0; c < snow.cols; c++) {
        const gi = r * snow.cols + c;
        const pi = (canvasRow * snow.cols + c) * 4;

        if (terrain.heights[gi] < 40) {
          imageData.data[pi + 3] = 0;
          continue;
        }

        const [red, green, blue, alpha] =
          mode === "historical"
            ? historicalSnowColor(snow.depth[gi], meanDepth, spreadDepth)
            : snowDepthColor(snow.depth[gi], snow.isPowderZone[gi] === 1);
        imageData.data[pi] = red;
        imageData.data[pi + 1] = green;
        imageData.data[pi + 2] = blue;
        imageData.data[pi + 3] = alpha;
      }
    }

    rawCtx.putImageData(imageData, 0, 0);

    // 2. Upscale with bilinear interpolation for smooth gradients
    const scale = 4;
    const canvas = document.createElement("canvas");
    canvas.width = snow.cols * scale;
    canvas.height = snow.rows * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(raw, 0, 0, canvas.width, canvas.height);

    return canvas;
  }

  private crossfade(oldLayer: ImageryLayer, newLayer: ImageryLayer, durationMs: number): void {
    this.cancelFade();

    // Clean up any previous fading layer that's still around
    if (this.fadingLayer && this.viewer.imageryLayers.contains(this.fadingLayer)) {
      this.viewer.imageryLayers.remove(this.fadingLayer);
    }
    this.fadingLayer = oldLayer;

    const start = performance.now();
    const startAlpha = oldLayer.alpha;
    newLayer.alpha = 0;

    const step = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / durationMs, 1);
      // Ease-out cubic
      const ease = 1 - (1 - t) * (1 - t) * (1 - t);

      newLayer.alpha = this._targetAlpha * ease;
      if (this.fadingLayer) {
        this.fadingLayer.alpha = startAlpha * (1 - ease);
      }

      if (t < 1) {
        this.fadeRaf = requestAnimationFrame(step);
      } else {
        // Done — remove old layer
        if (this.fadingLayer && this.viewer.imageryLayers.contains(this.fadingLayer)) {
          this.viewer.imageryLayers.remove(this.fadingLayer);
          this.fadingLayer = null;
        }
        this.fadeRaf = null;
      }
    };

    this.fadeRaf = requestAnimationFrame(step);
  }

  private cancelFade(): void {
    if (this.fadeRaf !== null) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = null;
    }
  }
}

// Legacy API for backwards compat (manual mode still uses this pattern)
let legacyManager: SnowOverlayManager | null = null;

export async function renderSnowOverlay(
  viewer: Viewer,
  snow: SnowDepthGrid,
  terrain: ElevationGrid,
  mode: "manual" | "historical" = "manual",
): Promise<void> {
  if (!legacyManager || (legacyManager as unknown as { viewer: Viewer }).viewer !== viewer) {
    legacyManager?.destroy();
    legacyManager = new SnowOverlayManager(viewer);
  }
  return legacyManager.render(snow, terrain, mode);
}

export function removeSnowOverlay(_viewer: Viewer): void {
  if (legacyManager) {
    legacyManager.remove();
    legacyManager = null;
  }
}
