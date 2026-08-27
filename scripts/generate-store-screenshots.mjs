import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startScreenshotHarness, waitForPageAssets } from './screenshot-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'docs', 'distribution', 'screenshots');
await mkdir(outDir, { recursive: true });

const surfaces = [
  { id: 'hero', name: '01_Home_Dashboard.png' },
  { id: 'live-tv', name: '02_Live_TV_Player.png' },
  { id: 'live-epg', name: '03_Electronic_Program_Guide.png' },
  { id: 'player-vod', name: '04_Native_libmpv_Player.png' },
  { id: 'player-series', name: '05_Series_Player_Episodes.png' },
  { id: 'library-details', name: '06_Movie_Details.png' },
  { id: 'upcoming', name: '07_Upcoming_Release_Calendar.png' },
  { id: 'm3u-editor', name: '08_M3U_Playlist_Workspace.png' },
  { id: 'downloads', name: '09_Download_Manager.png' },
  { id: 'light-theme', name: '10_Light_Appearance.png' },
];

const harness = await startScreenshotHarness(projectRoot);

let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    colorScheme: 'dark',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  for (const surface of surfaces) {
    await page.goto(`${harness.baseUrl}/?readme=${encodeURIComponent(surface.id)}`, {
      waitUntil: 'networkidle',
    });
    await waitForPageAssets(page, 300);

    const target = path.join(outDir, surface.name);
    await page.screenshot({ path: target, type: 'png' });
    console.log(`Generated screenshot: ${surface.name}`);
  }
} catch (error) {
  harness.writeOutput();
  throw error;
} finally {
  if (browser) await browser.close();
  harness.stop();
}
console.log('All store screenshots generated successfully!');
