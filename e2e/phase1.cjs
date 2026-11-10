// Phase 1 check: laptop keys really produce piano audio in a real browser.
const { chromium } = require('playwright');
(async () => {
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/play`);
await page.getByTestId('enable-audio').click();
await page.waitForFunction(() => !document.querySelector('[data-testid="enable-audio"]') && !document.querySelector('[role="status"]'), null, { timeout: 30000 });
// Tap the audio graph to measure real output level.
await page.evaluate(async () => {
  const Tone = window.__tone;
  window.__meter = new Tone.Meter();
  Tone.getDestination().connect(window.__meter);
});
const level = async () => page.evaluate(() => window.__meter.getValue());
console.log('silence dB:', await level());
await page.keyboard.down('KeyA'); await page.keyboard.down('KeyD'); await page.keyboard.down('KeyG');
await page.waitForTimeout(150);
const on = await page.evaluate(() => [...document.querySelectorAll('.pkey.on')].map((e) => e.getAttribute('aria-label')));
console.log('chord dB:', await level(), 'keys lit:', on);
await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyG');
await page.waitForTimeout(100);
console.log('lit after release:', await page.evaluate(() => document.querySelectorAll('.pkey.on').length));
await page.keyboard.press('KeyX');
await page.keyboard.down('KeyA'); await page.waitForTimeout(80);
console.log('after octave up:', await page.evaluate(() => [...document.querySelectorAll('.pkey.on')].map((e) => e.getAttribute('aria-label'))));
// stuck-note check: blur while holding
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await page.waitForTimeout(60);
console.log('lit after blur:', await page.evaluate(() => document.querySelectorAll('.pkey.on').length));
await page.keyboard.up('KeyA');
await page.screenshot({ path: 'e2e/screens/play.png' });
console.log('errors:', errors);
await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
