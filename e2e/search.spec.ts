import { test, expect } from "@playwright/test";

// Dismiss the WelcomePage overlay so the control panel is interactive.
async function dismissWelcome(page: import("@playwright/test").Page) {
  const dismissBtn = page.locator("text=Explore the Mountains");
  if (await dismissBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dismissBtn.click();
    await dismissBtn.waitFor({ state: "hidden", timeout: 3_000 });
  }
}

// The desktop control panel — avoids matching the mobile floating bar.
function panel(page: import("@playwright/test").Page) {
  return page.locator("div.glass-panel").filter({ has: page.locator("h1:text('Pow Predictor')") });
}

test.describe("Place search", () => {
  test("search input shows 'Hvor går turen?' placeholder", async ({ page }) => {
    await page.goto("/");
    await dismissWelcome(page);
    const input = panel(page).locator("input[placeholder='Hvor går turen?']");
    await expect(input).toBeVisible({ timeout: 15_000 });
  });

  test("typing a query shows dropdown with results", async ({ page }) => {
    // Set up route mock before navigating
    await page.route("**/ws.geonorge.no/stedsnavn/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          navn: [
            {
              stedsnavn: [{ skrivemåte: "Oslo" }],
              navneobjekttype: "by",
              kommuner: [{ kommunenavn: "Oslo" }],
              representasjonspunkt: { nord: 59.91, øst: 10.75 },
            },
            {
              stedsnavn: [{ skrivemåte: "Oslomarka" }],
              navneobjekttype: "skogsområde",
              kommuner: [{ kommunenavn: "Oslo" }],
              representasjonspunkt: { nord: 60.0, øst: 10.8 },
            },
          ],
        }),
      }),
    );

    await page.goto("/");
    await dismissWelcome(page);
    const input = panel(page).locator("input[placeholder='Hvor går turen?']");
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill("Oslo");
    const dropdown = panel(page).locator(".z-50");
    await expect(dropdown).toBeVisible({ timeout: 10_000 });
    await expect(dropdown.locator("button")).toHaveCount(2);

    // Each result should show a type pill badge
    const typeBadge = dropdown.locator("span.rounded-full").first();
    await expect(typeBadge).toBeVisible();
    await expect(typeBadge).toHaveText("by");
  });

  test("search returns non-mountain place types", async ({ page }) => {
    await page.route("**/ws.geonorge.no/stedsnavn/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          navn: [
            {
              stedsnavn: [{ skrivemåte: "Tromsø" }],
              navneobjekttype: "by",
              kommuner: [{ kommunenavn: "Tromsø" }],
              representasjonspunkt: { nord: 69.65, øst: 18.96 },
            },
            {
              stedsnavn: [{ skrivemåte: "Tromsøya" }],
              navneobjekttype: "øy",
              kommuner: [{ kommunenavn: "Tromsø" }],
              representasjonspunkt: { nord: 69.66, øst: 19.0 },
            },
            {
              stedsnavn: [{ skrivemåte: "Tromsdalstinden" }],
              navneobjekttype: "topp",
              kommuner: [{ kommunenavn: "Tromsø" }],
              representasjonspunkt: { nord: 69.63, øst: 19.1 },
            },
          ],
        }),
      }),
    );

    await page.goto("/");
    await dismissWelcome(page);
    const input = panel(page).locator("input[placeholder='Hvor går turen?']");
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill("Tromsø");
    const dropdown = panel(page).locator(".z-50");
    await expect(dropdown).toBeVisible({ timeout: 10_000 });

    const badges = dropdown.locator("span.rounded-full");
    const texts = await badges.allTextContents();
    const types = texts.map((t) => t.trim().toLowerCase());

    expect(types).toContain("by");
    expect(types).toContain("øy");
    expect(types).toContain("topp");
  });

  test("selecting a result updates the search input", async ({ page }) => {
    await page.route("**/ws.geonorge.no/stedsnavn/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          navn: [
            {
              stedsnavn: [{ skrivemåte: "Bergen" }],
              navneobjekttype: "by",
              kommuner: [{ kommunenavn: "Bergen" }],
              representasjonspunkt: { nord: 60.39, øst: 5.32 },
            },
          ],
        }),
      }),
    );

    await page.goto("/");
    await dismissWelcome(page);
    const input = panel(page).locator("input[placeholder='Hvor går turen?']");
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill("Bergen");
    const dropdown = panel(page).locator(".z-50");
    const firstResult = dropdown.locator("button").first();
    await expect(firstResult).toBeVisible({ timeout: 10_000 });

    await firstResult.click();
    await expect(input).toHaveValue("Bergen");
  });

  test("shows 'Ingen treff' for nonsense query", async ({ page }) => {
    await page.route("**/ws.geonorge.no/stedsnavn/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ navn: [] }),
      }),
    );

    await page.goto("/");
    await dismissWelcome(page);
    const input = panel(page).locator("input[placeholder='Hvor går turen?']");
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill("xyzqwerty12345");
    const noResults = panel(page).locator("text=Ingen treff");
    await expect(noResults).toBeVisible({ timeout: 10_000 });
  });
});
