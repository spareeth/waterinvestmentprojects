import { defineConfig, devices } from "@playwright/test";

// Takes the screenshots for the user guide (/guide) from the running portal with the fictional demo data.
// Not part of the test suite. Run after `npm run db:seed` and `npm run build`:  npm run guide:screenshots
// Images are written to public/user-guide/.

const PORT = Number(process.env.GUIDE_PORT ?? 3124);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/guide",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 1,
    // Full Chromium (not the headless shell), so the browser's PDF viewer shows teasers in the page.
    channel: "chromium",
  },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { APP_URL: baseURL },
  },
});
