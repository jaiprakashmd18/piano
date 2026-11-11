/**
 * Layout audit: opens every page at many screen sizes and fails when a page
 * scrolls sideways, an element sticks out of the viewport, piano keys become
 * too narrow to hit, or a tap target is too small.
 *
 *   npm run build && npm start      then      npm run test:responsive
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const shots = path.join(__dirname, 'screens', 'responsive');
const SIZES = [
  ['phone-small', 320, 568, true],
  ['phone', 375, 667, true],
  ['phone-large', 430, 932, true],
  ['phone-landscape', 844, 390, true],
  ['tablet-portrait', 768, 1024, true],
  ['tablet-landscape', 1024, 768, true],
  ['laptop-small', 1280, 720, false],
  ['laptop', 1440, 900, false],
  ['desktop', 1920, 1080, false],
  ['desktop-wide', 2560, 1440, false],
];
const PAGES = ['/', '/play', '/arranger', '/learn?song=fur-elise', '/library', '/import', '/studio', '/settings'];
const only = process.env.ONLY;

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  let failures = 0;
  for (const [name, width, height, touch] of SIZES) {
    if (only && !name.includes(only)) continue;
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch && width < 900 });
    const page = await ctx.newPage();
    for (const url of PAGES) {
      await page.goto(base + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      const r = await page.evaluate(() => {
        const vw = window.innerWidth;
        const out = { scroll: document.documentElement.scrollWidth - vw, over: [], key: null, small: [] };
        const scrollsX = (el) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p !== document.body && p !== document.documentElement) return true;
          }
          return false;
        };
        for (const el of document.querySelectorAll('main *, aside *')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) continue;
          if ((b.right > vw + 1 || b.left < -1) && !scrollsX(el)) out.over.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
        }
        const keys = [...document.querySelectorAll('.pkey.white')];
        if (keys.length) out.key = Math.round(keys[0].getBoundingClientRect().width * 10) / 10;
        for (const el of document.querySelectorAll('main button, main select, main a.btn')) {
          const b = el.getBoundingClientRect();
          if (b.width && (b.height < 30 || b.width < 30)) out.small.push(`${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 14)}:${Math.round(b.width)}x${Math.round(b.height)}`);
        }
        return out;
      });
      const problems = [];
      if (r.scroll > 1) problems.push(`page scrolls sideways by ${r.scroll}px`);
      if (r.over.length) problems.push(`sticking out: ${[...new Set(r.over)].slice(0, 5).join(', ')}`);
      if (r.key !== null && r.key < (touch ? 18 : 11)) problems.push(`white keys only ${r.key}px wide`);
      if (touch && r.small.length) problems.push(`small tap targets: ${[...new Set(r.small)].slice(0, 5).join(', ')}`);
      if (problems.length) failures++;
      console.log(`${problems.length ? 'FAIL' : ' ok '} ${name.padEnd(17)} ${String(width).padStart(4)}x${String(height).padEnd(4)} ${url.padEnd(22)} ${r.key !== null ? `key ${r.key}px ` : ''}${problems.join(' | ')}`);
      await page.screenshot({ path: path.join(shots, `${name}${url.replace(/[/?=]/g, '_')}.png`), fullPage: false });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} layout problem(s).` : '\nEvery page fits every tested screen size.');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
