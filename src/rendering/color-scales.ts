export function snowDepthColor(depthCm: number, isPowder: boolean, baseCm = 30): [number, number, number, number] {
  if (isPowder) {
    return [0, 230, 200, 255];
  }

  // Normalize to 0-1 relative to base snowfall
  const t = Math.min(depthCm / (baseCm * 2), 1); // 0 = bare, 1 = 2x base

  // Brown (scoured/thin) → white (base) → blue (deep accumulation)
  if (t < 0.3) {
    const s = t / 0.3;
    return [
      Math.round(120 + s * 50),
      Math.round(90 + s * 50),
      Math.round(60 + s * 60),
      255,
    ];
  } else if (t < 0.6) {
    const s = (t - 0.3) / 0.3;
    return [
      Math.round(170 + s * 85),
      Math.round(140 + s * 115),
      Math.round(120 + s * 135),
      255,
    ];
  } else {
    const s = (t - 0.6) / 0.4;
    return [
      Math.round(255 - s * 100),
      Math.round(255 - s * 30),
      255,
      255,
    ];
  }
}

/**
 * Historical snow color — shows deviation from domain mean.
 * Brown/warm = scoured (below average), white = average, blue = loaded (above average).
 * This makes wind redistribution visible regardless of total accumulation.
 *
 * @param depthCm — absolute snow depth at this cell
 * @param meanCm — domain-average snow depth
 * @param spreadCm — max deviation from mean (for normalization)
 */
export function historicalSnowColor(
  depthCm: number,
  meanCm = 30,
  spreadCm = 15,
): [number, number, number, number] {
  if (depthCm < 0.5) return [200, 220, 240, 15]; // near-transparent hint

  // Base alpha from absolute depth — more snow = more visible overlay
  const absT = Math.min(depthCm / 40, 1);
  const baseAlpha = Math.round(60 + absT * 195); // 60-255

  // Deviation from mean: negative = scoured, positive = loaded
  const dev = depthCm - meanCm;
  // Normalize to [-1, 1]
  const norm = spreadCm > 0.5 ? Math.max(-1, Math.min(1, dev / spreadCm)) : 0;

  if (norm < -0.1) {
    // Below average — scoured: brown/warm tones (more exposed rock/terrain)
    const s = Math.min((-norm - 0.1) / 0.9, 1); // 0-1 within scoured range
    return [
      Math.round(160 - s * 40),  // warm brown
      Math.round(140 - s * 50),
      Math.round(130 - s * 50),
      baseAlpha,
    ];
  } else if (norm <= 0.1) {
    // Near average — neutral light blue-gray
    return [
      Math.round(170),
      Math.round(180),
      Math.round(210),
      baseAlpha,
    ];
  } else {
    // Above average — loaded: deep blue (wind-deposited)
    const s = Math.min((norm - 0.1) / 0.9, 1); // 0-1 within loaded range
    return [
      Math.round(140 - s * 100),  // blue deepens
      Math.round(160 - s * 90),
      Math.round(220 - s * 30),
      Math.round(Math.min(baseAlpha + s * 40, 255)),
    ];
  }
}

export function windSpeedColor(speedMs: number): [number, number, number, number] {
  const t = Math.min(speedMs / 25, 1);

  if (t < 0.33) {
    const s = t / 0.33;
    return [Math.round(30 + s * 30), Math.round(120 + s * 135), 255, 255];
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33;
    return [Math.round(60 + s * 195), 255, Math.round(255 - s * 100), 255];
  } else {
    const s = (t - 0.66) / 0.34;
    return [255, Math.round(255 - s * 200), Math.round(155 - s * 135), 255];
  }
}
