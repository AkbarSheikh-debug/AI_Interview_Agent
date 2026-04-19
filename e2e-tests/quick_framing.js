// Quick screenshot of the avatar panel only
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const RESUME = path.resolve(__dirname, '..', 'akkbaar-cv.pdf');
const SHOT_DIR = path.join(__dirname, 'screenshots');

async function findPort() {
  const http = require('http');
  for (const port of [5174, 5173]) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}`, resolve);
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(); });
      });
      return port;
    } catch {}
  }
  throw new Error('No frontend');
}

(async () => {
  const port = await findPort();
  console.log('Using port', port);
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone'],
  });
  const page = await context.newPage();

  await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Start Interview', { timeout: 15000 });
  await page.setInputFiles('input#file-input', RESUME);
  await page.click('button:has-text("Start Interview")');
  await page.waitForURL(/\/interview\//, { timeout: 120000 });
  console.log('On interview page');
  
  // Wait for Three.js to render
  await page.waitForTimeout(8000);
  
  // Full page screenshot
  await page.screenshot({ path: path.join(SHOT_DIR, 'framing-test-full.png'), fullPage: true });
  console.log('Saved framing-test-full.png');
  
  // Avatar canvas closeup
  const canvas = page.locator('canvas').first();
  if (await canvas.isVisible()) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.screenshot({
        path: path.join(SHOT_DIR, 'framing-test-avatar.png'),
        clip: { x: box.x, y: box.y, width: box.width, height: box.height }
      });
      console.log(`Saved framing-test-avatar.png (${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)})`);
    }
  }
  
  await browser.close();
  console.log('Done');
})();
