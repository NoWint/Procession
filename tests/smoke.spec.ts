import { test, expect } from "@playwright/test";

// Smoke tests for Procession (I-701).
//
// Browser-context caveats:
// - `@tauri-apps/api`'s `invoke()`/`listen()` do not work outside Tauri, so
//   `useSystemData` never receives a `system-snapshot` event.
// - The app cycles through three phases in this context:
//     1. "Loading visual system..."   — while the theme loads (brief)
//     2. "Waiting for system data..." — `backendStatus === "connecting"`,
//        ~5s until the backend-unresponsive timeout fires
//     3. Empty city render            — `backendStatus === "backend-unresponsive"`,
//        R3F `<canvas>` mounts, banner "后端无响应，正在重试..." shows
// - Tests must tolerate this cycle and must NOT assert on real system data.

test.describe("Procession smoke", () => {
  test("app window opens with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Procession/i);
  });

  test("R3F canvas renders", async ({ page }) => {
    await page.goto("/");

    // The canvas only mounts after the ~5s backend-unresponsive fallback
    // kicks in and the app falls through to the empty-city render path.
    // 20s timeout gives plenty of headroom over the dev server cold start.
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 20_000 });

    const box = await canvas.boundingBox();
    expect(box, "canvas must have a bounding box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test("loading state appears", async ({ page }) => {
    await page.goto("/");

    // Either loading message is acceptable — the brief theme-load phase
    // shows "Loading visual system..." and the connecting phase shows
    // "Waiting for system data...". Both indicate the app booted.
    const loading = page
      .getByText("Loading visual system...")
      .or(page.getByText("Waiting for system data..."));

    await expect(loading).toBeVisible();
  });
});
