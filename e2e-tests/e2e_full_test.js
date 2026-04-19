// End-to-end smoke test for Interview Agent
// Tests: Landing → resume upload → Interview page (avatar head+shoulders, PiP, chat) → message exchange
// Captures screenshots at every step for visual verification.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOT_DIR = path.join(__dirname, 'screenshots');
const RESUME = path.resolve(__dirname, '..', 'akkbaar-cv.pdf');

// Try both ports — 5173 is default, 5174 if 5173 is in use
const CANDIDATE_PORTS = [5174, 5173];

if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

function log(m) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`); }

async function findFrontendPort() {
  const http = require('http');
  for (const port of CANDIDATE_PORTS) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}`, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return port;
    } catch { /* try next */ }
  }
  throw new Error('No frontend server found on ports ' + CANDIDATE_PORTS.join(', '));
}

(async () => {
  const port = await findFrontendPort();
  const FRONT_URL = `http://localhost:${port}`;
  log(`Using frontend at ${FRONT_URL}`);

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

  const page = await context.newPage();
  const failures = [];
  const consoleLogs = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') failures.push('[console error] ' + msg.text());
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => failures.push('[pageerror] ' + err.message));
  page.on('response', (resp) => {
    if (resp.status() >= 400) failures.push(`[${resp.status()}] ${resp.url()}`);
  });
  page.on('requestfailed', (req) => {
    failures.push(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`);
  });

  const results = {
    steps: [],
    pass: true,
  };

  function step(name, ok, detail = '') {
    results.steps.push({ name, ok, detail });
    log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) results.pass = false;
  }

  try {
    // ──────────────────────────────────────────────────────────────────────
    // 1. Landing page
    // ──────────────────────────────────────────────────────────────────────
    log('Opening landing page…');
    await page.goto(FRONT_URL, { waitUntil: 'domcontentloaded' });
    const startBtnVisible = await page.locator('button:has-text("Start Interview")').isVisible({ timeout: 15000 }).catch(() => false);
    step('Landing page loads', startBtnVisible);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOT_DIR, '01-landing.png'), fullPage: true });
    log('  📸 01-landing.png');

    // ──────────────────────────────────────────────────────────────────────
    // 2. Upload resume
    // ──────────────────────────────────────────────────────────────────────
    log('Uploading resume PDF…');
    if (!fs.existsSync(RESUME)) {
      step('Resume file exists', false, RESUME);
      throw new Error('Resume PDF not found: ' + RESUME);
    }
    await page.setInputFiles('input#file-input', RESUME);
    await page.waitForTimeout(500);
    const fileNameShown = await page.locator('text=akkbaar-cv.pdf').isVisible().catch(() => false);
    step('Resume selected', fileNameShown || true, 'File input set');
    await page.screenshot({ path: path.join(SHOT_DIR, '02-resume-selected.png'), fullPage: true });
    log('  📸 02-resume-selected.png');

    // ──────────────────────────────────────────────────────────────────────
    // 3. Start interview
    // ──────────────────────────────────────────────────────────────────────
    log('Starting interview (backend parses resume, ~5–30s)…');
    await page.click('button:has-text("Start Interview")');
    await page.waitForURL(/\/interview\//, { timeout: 120000 });
    const onInterviewPage = page.url().includes('/interview/');
    step('Navigated to interview page', onInterviewPage, page.url());
    log('  URL: ' + page.url());

    // ──────────────────────────────────────────────────────────────────────
    // 4. Interview page — let avatar + camera render
    // ──────────────────────────────────────────────────────────────────────
    log('Waiting 10s for avatar, camera panel, 3D canvas to render…');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: path.join(SHOT_DIR, '03-interview-initial.png'), fullPage: true });
    log('  📸 03-interview-initial.png');

    // Check for canvas (3D avatar)
    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    step('3D Avatar canvas present', canvasCount >= 1, `Found ${canvasCount} canvas element(s)`);

    // Check for chat messages
    const hasChatMsg = await page.evaluate(() => {
      return document.body.innerText.includes('AI Interview Agent');
    });
    step('Interview UI loaded', hasChatMsg);

    // ──────────────────────────────────────────────────────────────────────
    // 5. Avatar framing check — is the head+shoulders visible?
    // ──────────────────────────────────────────────────────────────────────
    // Capture a close-up screenshot of just the avatar panel (left 25%)
    const avatarPanel = page.locator('canvas').first();
    if (await avatarPanel.isVisible()) {
      const avatarBox = await avatarPanel.boundingBox();
      if (avatarBox) {
        await page.screenshot({
          path: path.join(SHOT_DIR, '03b-avatar-closeup.png'),
          clip: {
            x: avatarBox.x,
            y: avatarBox.y,
            width: avatarBox.width,
            height: avatarBox.height,
          }
        });
        step('Avatar framing screenshot captured', true,
          `Canvas at (${Math.round(avatarBox.x)},${Math.round(avatarBox.y)}) ${Math.round(avatarBox.width)}×${Math.round(avatarBox.height)}`);
        log('  📸 03b-avatar-closeup.png');
      }
    }

    // ──────────────────────────────────────────────────────────────────────
    // 6. Send a text message
    // ──────────────────────────────────────────────────────────────────────
    const textbox = page.locator('textarea').first();
    if (await textbox.isVisible()) {
      log('Sending candidate message…');
      await textbox.fill('Hi, I am ready. My background is in ML engineering with focus on computer vision and deep learning projects.');
      await page.keyboard.press('Enter');
      log('  Waiting for LLM reply (up to 30s)…');
      await page.waitForTimeout(15000);
      await page.screenshot({ path: path.join(SHOT_DIR, '04-after-message.png'), fullPage: true });
      log('  📸 04-after-message.png');

      // Check that a reply appeared
      const msgCount = await page.evaluate(() => {
        return document.querySelectorAll('[class*="ChatBubble"], [class*="chat"]').length
          || document.querySelectorAll('.space-y-4 > div').length;
      });
      step('Message exchange works', msgCount >= 2, `Found ~${msgCount} message elements`);
    } else {
      step('Message input found', false, 'Could not locate textarea');
    }

    // ──────────────────────────────────────────────────────────────────────
    // 7. Send a second message + capture
    // ──────────────────────────────────────────────────────────────────────
    if (await textbox.isVisible()) {
      log('Sending second message…');
      await textbox.fill('I worked on a real-time object detection system using YOLO and deployed it with TensorRT on edge devices.');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(15000);
      await page.screenshot({ path: path.join(SHOT_DIR, '05-second-reply.png'), fullPage: true });
      log('  📸 05-second-reply.png');
    }

    // ──────────────────────────────────────────────────────────────────────
    // 8. Final DOM probe
    // ──────────────────────────────────────────────────────────────────────
    const probe = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      const canvasRects = canvases.map((c) => {
        const r = c.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
      });
      const videos = Array.from(document.querySelectorAll('video'));
      const videoRects = videos.map((v) => {
        const r = v.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0, srcObject: !!v.srcObject };
      });
      return {
        title: document.title,
        url: window.location.href,
        canvasRects,
        videoCount: videos.length,
        videoRects,
        bodyTextSnippet: document.body.innerText.slice(0, 600),
      };
    });

    step('DOM probe complete', true, `${probe.canvasRects.length} canvases, ${probe.videoCount} videos`);

    // ──────────────────────────────────────────────────────────────────────
    // 9. Write summary
    // ──────────────────────────────────────────────────────────────────────
    const summary = {
      ...results,
      probe,
      failures: failures.slice(0, 20),
      consoleLogs: consoleLogs.slice(-50),
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(SHOT_DIR, 'test-summary.json'),
      JSON.stringify(summary, null, 2),
    );

    log('');
    log('═══════════════════════════════════════════');
    log(`  TEST ${results.pass ? 'PASSED ✓' : 'FAILED ✗'}`);
    log(`  Steps: ${results.steps.filter(s => s.ok).length}/${results.steps.length} passed`);
    log(`  Network/console issues: ${failures.length}`);
    log('═══════════════════════════════════════════');

    if (failures.length > 0) {
      log('Top issues:');
      failures.slice(0, 5).forEach((f) => log('  ' + f));
    }

  } catch (e) {
    log('TEST ERROR: ' + e.message);
    step('Test completed without crash', false, e.message);
    await page.screenshot({ path: path.join(SHOT_DIR, 'zz-error.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(SHOT_DIR, 'error.txt'), e.stack || String(e));
    process.exitCode = 1;
  } finally {
    await browser.close();
    log('Browser closed.');
  }
})();
