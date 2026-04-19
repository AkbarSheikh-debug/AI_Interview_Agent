// Quick debug script to capture the avatar bounding box console logs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const RESUME = path.resolve(__dirname, '..', 'akkbaar-cv.pdf');

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
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone'],
  });
  const page = await context.newPage();

  const debugLogs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('AvatarModel') || text.includes('bbox') || text.includes('CameraRig') || text.includes('DEBUG')) {
      debugLogs.push(text);
      console.log('[LOG]', text);
    }
  });

  await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Start Interview', { timeout: 15000 });
  await page.setInputFiles('input#file-input', RESUME);
  await page.click('button:has-text("Start Interview")');
  await page.waitForURL(/\/interview\//, { timeout: 120000 });
  
  // Wait for Three.js to render
  await page.waitForTimeout(5000);
  
  // Evaluate the canvas dimensions
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { width: r.width, height: r.height, aspect: r.width / r.height };
  });

  console.log('\n=== RESULTS ===');
  console.log('Canvas info:', JSON.stringify(canvasInfo));
  console.log('Debug logs:');
  debugLogs.forEach(l => console.log(' ', l));
  
  await browser.close();
})();
