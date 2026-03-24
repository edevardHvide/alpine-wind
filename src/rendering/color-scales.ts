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

export function historicalSnowColor(depthCm: number): [number, number, number, number] {
  if (depthCm < 0.5) return [200, 220, 240, 15]; // near-transparent hint

  const t = Math.min(depthCm / 60, 1); // 0 = no snow, 1 = 60cm+

  if (t < 0.12) {
    // 0-7cm: faint dusting — light tint that darkens terrain slightly
    const s = t / 0.12;
    return [
      Math.round(180 - s * 60),
      Math.round(200 - s * 40),
      Math.round(230 - s * 10),
      Math.round(40 + s * 80),
    ];
  } else if (t < 0.35) {
    // 7-21cm: moderate — cool blue, terrain noticeably darker
    const s = (t - 0.12) / 0.23;
    return [
      Math.round(120 - s * 60),
      Math.round(160 - s * 50),
      Math.round(220 - s * 20),
      Math.round(120 + s * 100),
    ];
  } else if (t < 0.65) {
    // 21-39cm: deep accumulation — rich blue, mostly opaque
    const s = (t - 0.35) / 0.3;
    return [
      Math.round(60 - s * 25),
      Math.round(110 - s * 50),
      Math.round(200 - s * 30),
      Math.round(220 + s * 35),
    ];
  } else {
    // 39-60cm+: very deep — dark blue-indigo, fully opaque, terrain dark
    const s = (t - 0.65) / 0.35;
    return [
      Math.round(35 - s * 15),
      Math.round(60 - s * 30),
      Math.round(170 - s * 40),
      255,
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
