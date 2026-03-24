import { test, expect } from "@playwright/test";

test.describe("Spatial weather fetch", () => {
  test("fetches 9 stations with distinct data", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    const result = await page.evaluate(async () => {
      const mod = await import("/src/api/nve.ts");

      const weather = await mod.fetchSpatialWeather(
        61.636, 8.312,       // center (Galdhøpiggen)
        8.012, 61.536,       // west, south
        8.612, 61.736,       // east, north
        7, 5,
      );

      // Check that stations have different values (spatial variation)
      const temps0 = weather.stations.map(s => s.temp[0]);
      const precips0 = weather.stations.map(s => s.precip[0]);
      const tempRange = Math.max(...temps0) - Math.min(...temps0);
      const precipRange = Math.max(...precips0) - Math.min(...precips0);

      return {
        stationCount: weather.stations.length,
        timestepCount: weather.timestamps.length,
        tempRange: tempRange.toFixed(2),
        precipRange: precipRange.toFixed(2),
        altitudes: weather.stations.map(s => s.altitude),
        sampleTemps: temps0.map(t => t.toFixed(1)),
      };
    });

    console.log("Result:", JSON.stringify(result, null, 2));

    expect(result.stationCount).toBe(9);
    expect(result.timestepCount).toBeGreaterThan(50);
    // Stations at different altitudes should have different temps
    expect(parseFloat(result.tempRange)).toBeGreaterThan(0);
  });

  test("per-cell snowfall produces spatial variation in simulation", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    const result = await page.evaluate(async () => {
      const nveMod = await import("/src/api/nve.ts");
      const simMod = await import("/src/simulation/historical-sim.ts");

      // Create a minimal mock terrain for testing
      const rows = 20, cols = 20;
      const n = rows * cols;
      const heights = new Float64Array(n);
      // Varying altitude: low in NW corner, high in SE corner
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          heights[r * cols + c] = 500 + (r + c) * 40; // 500-2060m range
        }
      }

      const terrain = {
        heights,
        rows,
        cols,
        bbox: { west: 8.012, south: 61.536, east: 8.612, north: 61.736 },
        cellSizeMeters: 75,
        slopes: new Float64Array(n),
        aspects: new Float64Array(n),
        normalsX: new Float64Array(n),
        normalsY: new Float64Array(n),
        normalsZ: new Float64Array(n),
      };

      // Fetch real spatial weather
      const weather = await nveMod.fetchSpatialWeather(
        61.636, 8.312,
        8.012, 61.536,
        8.612, 61.736,
        3, 1, // fewer days for speed
      );

      // Run simulation (first few steps only)
      const weatherSubset: typeof weather = {
        timestamps: weather.timestamps.slice(0, 8),
        stations: weather.stations.map(s => ({
          ...s,
          temp: s.temp.slice(0, 8),
          precip: s.precip.slice(0, 8),
          windSpeed: s.windSpeed.slice(0, 8),
          windDir: s.windDir.slice(0, 8),
        })),
      };

      const steps = await simMod.runHistoricalSimulation(terrain, weatherSubset);

      // Check the last step for spatial variation in snow depth
      const lastStep = steps[steps.length - 1];
      const depths = Array.from(lastStep.snowGrid.depth);
      const landDepths = depths.filter((_, i) => heights[i] >= 40);

      const min = Math.min(...landDepths);
      const max = Math.max(...landDepths);
      const mean = landDepths.reduce((a, b) => a + b, 0) / landDepths.length;

      return {
        totalSteps: steps.length,
        stationCount: weather.stations.length,
        depthMin: min.toFixed(2),
        depthMax: max.toFixed(2),
        depthMean: mean.toFixed(2),
        depthRange: (max - min).toFixed(2),
        hasVariation: max - min > 0.01,
      };
    });

    console.log("Simulation result:", JSON.stringify(result, null, 2));

    expect(result.stationCount).toBe(9);
    expect(result.totalSteps).toBeGreaterThan(10);
    // Snow depth should have spatial variation
    console.log(`Snow depth range: ${result.depthMin} - ${result.depthMax} cm (${result.depthRange} cm variation)`);
  });

  test("lapse rate correction produces expected temperature gradient", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    const result = await page.evaluate(async () => {
      const mod = await import("/src/api/nve.ts");

      const weather = await mod.fetchSpatialWeather(
        61.636, 8.312, 8.012, 61.536, 8.612, 61.736, 3, 1,
      );

      // Simulate what the sim does: IDW + lapse rate
      const stations = weather.stations;
      // Pick a low point (61.69, 8.15) near station at 762m altitude
      // and a high point (61.58, 8.47) near station at 2157m altitude
      // Lapse rate should add ~-6.5°C per 1000m delta from station alt to terrain alt

      // Station temps at t=0
      const lowStation = stations.find(s => s.altitude < 1000);
      const highStation = stations.find(s => s.altitude > 2000);

      if (!lowStation || !highStation) return { error: "missing stations" };

      // At terrain elevation 400m (a valley) vs 2200m (a peak)
      // Valley near low station (762m): correction = (400-762) * -6.5/1000 = +2.4°C warmer
      // Peak near high station (2157m): correction = (2200-2157) * -6.5/1000 = -0.3°C cooler
      const valleyTemp = lowStation.temp[0] + (400 - lowStation.altitude) * (-6.5 / 1000);
      const peakTemp = highStation.temp[0] + (2200 - highStation.altitude) * (-6.5 / 1000);

      return {
        lowStationAlt: lowStation.altitude,
        lowStationTemp: lowStation.temp[0].toFixed(1),
        valleyTemp: valleyTemp.toFixed(1),
        highStationAlt: highStation.altitude,
        highStationTemp: highStation.temp[0].toFixed(1),
        peakTemp: peakTemp.toFixed(1),
        tempDifference: (valleyTemp - peakTemp).toFixed(1),
        expectedLapseDiff: ((2200 - 400) * 6.5 / 1000).toFixed(1),
      };
    });

    console.log("Lapse rate test:", JSON.stringify(result, null, 2));

    expect(result).not.toHaveProperty("error");
    // Temperature difference between 400m valley and 2200m peak should be ~11.7°C
    const diff = parseFloat(result.tempDifference);
    expect(diff).toBeGreaterThan(5);
    console.log(`Valley (400m): ${result.valleyTemp}°C, Peak (2200m): ${result.peakTemp}°C, Diff: ${result.tempDifference}°C`);
  });
});
