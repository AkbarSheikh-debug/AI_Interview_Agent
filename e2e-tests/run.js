// End-to-end smoke test for Interview Agent
// Exercises: Landing → resume upload → Interview page (avatar + PiP + chat) → message exchange
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOT_DIR = path.join(__dirname, 'screenshots');
const RESUME = path.resolve(__dirname, '..', 'akkbaar-cv.pdf');
const FRONT_URL = 'http://localhost:5173';

if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

function log(m) { console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`); }

(async () => {
  log('Launching Chromium with fake media stream…');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone'],
  });

  // Capture console + network problems for diagnostics
  const page = await context.newPage();
  const failures = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') failures.push('[console error] ' + msg.text());
    if (msg.text().includes('CameraRig') || msg.text().includes('AvatarViewer') || msg.text().includes('AvatarModel') || msg.text().includes('bbox') || msg.text().includes('meshes')) console.log('[app log]', msg.text());
  });
  page.on('pageerror', (err) => failures.push('[pageerror] ' + err.message));
  page.on('response', (resp) => {
    if (resp.status() >= 400) failures.push(`[${resp.status()}] ${resp.url()}`);
    if (resp.url().includes('/api/resume/') || resp.url().includes('/api/interview/start')) {
      console.log(`[network ${resp.status()}] ${resp.url()}`);
    }
  });
  page.on('requestfailed', (req) => {
    console.log(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`);
  });

  try {
    // 1. Landing ───────────────────────────────────────────────
    log('Opening landing page…');
    await page.goto(FRONT_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Start Interview', { timeout: 15000 });
    await page.waitForTimeout(1500); // let model dropdowns populate
    await page.screenshot({ path: path.join(SHOT_DIR, '01-landing.png'), fullPage: true });
    log('✓ 01-landing.png');

    // 2. Upload resume ─────────────────────────────────────────
    log('Uploading resume PDF…');
    await page.setInputFiles('input#file-input', RESUME);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOT_DIR, '02-resume-selected.png'), fullPage: true });
    log('✓ 02-resume-selected.png');

    // 3. Start interview ───────────────────────────────────────
    log('Starting interview (this takes ~5–15s while backend parses resume)…');
    await page.click('button:has-text("Start Interview")');
    await page.waitForURL(/\/interview\//, { timeout: 120000 });
    log('Navigated to ' + page.url());

    // 4. Interview loaded — let avatar, camera panel, first message render
    await page.waitForTimeout(8000);
    await page.screenshot({ path: path.join(SHOT_DIR, '03-interview-initial.png'), fullPage: true });
    log('✓ 03-interview-initial.png');

    // 5. Send a text message
    const textbox = await page.locator('textarea, input[type="text"]').first();
    if (await textbox.count()) {
      log('Sending candidate message…');
      await textbox.fill('Hi, I am ready. My background is in ML engineering with computer vision projects.');
      await page.keyboard.press('Enter').catch(async () => {
        await page.click('button:has-text("Send")').catch(() => {});
      });
      await page.waitForTimeout(12000); // wait for LLM reply
      await page.screenshot({ path: path.join(SHOT_DIR, '04-after-message.png'), fullPage: true });
      log('✓ 04-after-message.png');
    } else {
      log('! Could not locate message input — skipping send');
    }

    // 6. Final DOM probe: are PiP, avatar, chat all present?
    const probe = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      const canvasRects = canvases.map((c) => {
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, x: r.x, y: r.y, attrW: c.width, attrH: c.height };
      });
      return {
        title: document.title,
        videoCount: document.querySelectorAll('video').length,
        canvasRects,
        bodyText: document.body.innerText.slice(0, 400),
      };
    });
    log('DOM probe: ' + JSON.stringify(probe, null, 2));

    fs.writeFileSync(
      path.join(SHOT_DIR, 'summary.json'),
      JSON.stringify({ probe, failures, url: page.url() }, null, 2),
    );
    log(`Captured ${failures.length} network/console issues`);
    if (failures.length) failures.slice(0, 10).forEach((f) => log('  ' + f));
  } catch (e) {
    log('TEST ERROR: ' + e.message);
    await page.screenshot({ path: path.join(SHOT_DIR, 'zz-error.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(SHOT_DIR, 'error.txt'), e.stack || String(e));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
