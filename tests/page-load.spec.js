// @ts-check
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const TARGET_URL = "https://www.bajajfinserv.in/live";
const LOAD_BUDGET_MS = Number(process.env.LOAD_BUDGET_MS || 8000);
const DOMCONTENTLOADED_BUDGET_MS = Number(process.env.DOM_BUDGET_MS || 5000);

const REPORTS_DIR = path.resolve(__dirname, "..", "reports");
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

test.describe("bajajfinserv.in/live — page load", () => {
  test("loads within budget and reports navigation timings", async ({
    page,
  }, testInfo) => {
    const t0 = Date.now();
    const response = await page.goto(TARGET_URL, { waitUntil: "load" });
    const wallClockMs = Date.now() - t0;

    expect(response, "navigation response should exist").not.toBeNull();
    expect(
      response.status(),
      `status should be 2xx (was ${response.status()})`,
    ).toBeLessThan(400);

    await page.waitForLoadState("domcontentloaded");

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paints = performance.getEntriesByType("paint");
      const fp = paints.find((p) => p.name === "first-paint");
      const fcp = paints.find((p) => p.name === "first-contentful-paint");
      return {
        navigationStart: nav?.startTime ?? 0,
        domInteractive: nav?.domInteractive ?? 0,
        domContentLoaded: nav?.domContentLoadedEventEnd ?? 0,
        loadEventEnd: nav?.loadEventEnd ?? 0,
        responseEnd: nav?.responseEnd ?? 0,
        transferSizeBytes: nav?.transferSize ?? 0,
        encodedBodySizeBytes: nav?.encodedBodySize ?? 0,
        firstPaint: fp ? fp.startTime : null,
        firstContentfulPaint: fcp ? fcp.startTime : null,
      };
    });

    const metrics = {
      url: TARGET_URL,
      httpStatus: response.status(),
      wallClockMs,
      ...timing,
      title: await page.title(),
      timestamp: new Date().toISOString(),
    };

    const outFile = path.join(REPORTS_DIR, `metrics-${Date.now()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(metrics, null, 2));
    await testInfo.attach("page-load-metrics", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });

    console.log("[page-load metrics]", JSON.stringify(metrics, null, 2));

    expect(
      metrics.domContentLoaded,
      `DOMContentLoaded ${metrics.domContentLoaded}ms exceeded budget ${DOMCONTENTLOADED_BUDGET_MS}ms`,
    ).toBeLessThan(DOMCONTENTLOADED_BUDGET_MS);

    expect(
      metrics.loadEventEnd,
      `load event ${metrics.loadEventEnd}ms exceeded budget ${LOAD_BUDGET_MS}ms`,
    ).toBeLessThan(LOAD_BUDGET_MS);

    await expect(page).toHaveTitle(/.+/);
  });
});
