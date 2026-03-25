import { test, expect, devices } from "@playwright/test";

test.describe("PWA / Mobile", () => {
  test("manifest is valid and accessible", async ({ page }) => {
    const res = await page.goto("/manifest.webmanifest");
    expect(res?.status()).toBe(200);

    const manifest = await res?.json();
    console.log("Manifest:", JSON.stringify(manifest, null, 2));

    expect(manifest.name).toBe("Pow Predictor");
    expect(manifest.short_name).toBe("Pow");
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toBe("#0f172a");
    expect(manifest.theme_color).toBe("#0f172a");
    expect(manifest.icons).toHaveLength(2);
    expect(manifest.icons[0].sizes).toBe("192x192");
    expect(manifest.icons[1].sizes).toBe("512x512");
  });

  test("icons are accessible", async ({ page }) => {
    const icon192 = await page.goto("/icon-192.png");
    expect(icon192?.status()).toBe(200);
    expect(icon192?.headers()["content-type"]).toContain("image/png");

    const icon512 = await page.goto("/icon-512.png");
    expect(icon512?.status()).toBe(200);

    const appleIcon = await page.goto("/apple-touch-icon.png");
    expect(appleIcon?.status()).toBe(200);
  });

  test("HTML has PWA meta tags", async ({ page }) => {
    await page.goto("/");

    const manifest = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifest).toBe("/manifest.webmanifest");

    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute("content");
    expect(themeColor).toBe("#0f172a");

    const appleCapable = await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute("content");
    expect(appleCapable).toBe("yes");

    const appleStatusBar = await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute("content");
    expect(appleStatusBar).toBe("black-translucent");

    const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect(appleIcon).toBe("/apple-touch-icon.png");

    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).toBeTruthy();

    const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
    expect(favicon).toBe("/favicon.svg");

    console.log("All PWA meta tags present");
  });

  test("mobile viewport renders app", async ({ browser }) => {
    const iPhone = devices["iPhone 13"];
    const context = await browser.newContext({
      ...iPhone,
    });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForTimeout(2000);

    // App should load
    const title = await page.title();
    expect(title).toBe("Pow Predictor");

    // Take a screenshot for visual check
    await page.screenshot({ path: "test-results/pwa-mobile.png" });
    console.log("Mobile screenshot saved to test-results/pwa-mobile.png");

    // Viewport should be mobile-sized
    const viewport = page.viewportSize();
    console.log(`Mobile viewport: ${viewport?.width}x${viewport?.height}`);
    expect(viewport?.width).toBeLessThan(500);

    await context.close();
  });

  test("mobile landscape renders app", async ({ browser }) => {
    const iPhoneLandscape = devices["iPhone 13 landscape"];
    const context = await browser.newContext({
      ...iPhoneLandscape,
    });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "test-results/pwa-mobile-landscape.png" });
    console.log("Landscape screenshot saved to test-results/pwa-mobile-landscape.png");

    const viewport = page.viewportSize();
    console.log(`Landscape viewport: ${viewport?.width}x${viewport?.height}`);
    expect(viewport?.width).toBeGreaterThan(viewport?.height ?? 0);

    await context.close();
  });
});
