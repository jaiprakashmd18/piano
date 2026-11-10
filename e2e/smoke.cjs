/**
 * End-to-end smoke test in a real Chromium: drives the app with keyboard
 * events and measures the actual audio output level.
 *
 *   npm run build && npm start        (in one terminal)
 *   npm run test:e2e                  (in another)
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const shots = path.join(__dirname, 'screens');
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());

  const enableAudio = async () => {
    await page.getByTestId('enable-audio').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="enable-audio"]') && !document.querySelector('[role="status"]')?.textContent?.includes('Loading'), null, { timeout: 30000 });
    await page.evaluate(() => {
      const T = window.__tone;
      window.__meter = new T.Meter({ smoothing: 0 });
      T.getDestination().connect(window.__meter);
    });
  };
  const peak = async (ms) => {
    let p = -Infinity;
    const end = Date.now() + ms;
    while (Date.now() < end) {
      p = Math.max(p, await page.evaluate(() => window.__meter.getValue()));
      await page.waitForTimeout(25);
    }
    return p;
  };
  const lit = () => page.evaluate(() => [...document.querySelectorAll('.pkey.on')].map((e) => e.getAttribute('aria-label')));

  // ---------------------------------------------------------------- Home
  console.log('Home');
  await page.goto(base);
  check('home renders', (await page.locator('h1').innerText()).includes('laptop keyboard'));

  // ---------------------------------------------------------------- Play
  console.log('Play Piano');
  await page.goto(`${base}/play`);
  await enableAudio();
  check('silent before playing', (await peak(150)) < -80);
  for (const k of ['KeyA', 'KeyD', 'KeyG']) await page.keyboard.down(k);
  const chordLevel = await peak(250);
  check('A+D+G sounds a chord', chordLevel > -40, `${chordLevel.toFixed(1)} dB`);
  check('keys C4 E4 G4 light up', JSON.stringify(await lit()) === JSON.stringify(['C4', 'E4', 'G4']));
  // auto-repeat must not retrigger or break anything
  await page.keyboard.down('KeyA');
  for (const k of ['KeyA', 'KeyD', 'KeyG']) await page.keyboard.up(k);
  await page.waitForTimeout(80);
  check('keys release', (await lit()).length === 0);
  await page.keyboard.press('KeyX');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(60);
  check('X shifts octave up', (await lit())[0] === 'C5');
  await page.keyboard.press('KeyZ'); // octave changes while holding must not strand the note
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(60);
  check('no stuck note after octave change while holding', (await lit()).length === 0);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(40);
  check('W plays C#4', (await lit())[0] === 'C#4');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(60);
  check('window blur releases held notes', (await lit()).length === 0);
  await page.keyboard.up('KeyW');
  // sustain: note keeps sounding after key-up while Shift is held
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(700);
  const sustained = await peak(150);
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(3000);
  const released = await peak(150);
  // control: without the pedal the same note must be much quieter at the same moment
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(700);
  const unsustained = await peak(150);
  check('Shift sustains a released note; without it the note is damped', sustained > -45 && unsustained < sustained - 10 && released < -55, `pedal ${sustained.toFixed(1)} dB, no pedal ${unsustained.toFixed(1)} dB, later ${released.toFixed(1)} dB`);
  // every instrument makes sound
  const ids = await page.locator('select[aria-label="Instrument"] option').evaluateAll((o) => o.map((x) => x.value));
  const quiet = [];
  for (const id of ids) {
    await page.locator('select[aria-label="Instrument"]').selectOption(id);
    await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('Loading'), null, { timeout: 30000 });
    await page.waitForTimeout(150);
    await page.keyboard.down('KeyG');
    const p = await peak(300);
    await page.keyboard.up('KeyG');
    if (p < -50) quiet.push(`${id}:${p.toFixed(0)}`);
  }
  check(`all ${ids.length} instruments produce audio`, quiet.length === 0, quiet.join(' '));
  await page.locator('select[aria-label="Instrument"]').selectOption('grand');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(shots, 'play.png') });

  // ------------------------------------------------------------ Arranger
  console.log('Arranger');
  await page.goto(`${base}/arranger`);
  await enableAudio();
  await page.waitForFunction(() => !document.querySelector('[data-testid="start-stop"]').disabled, null, { timeout: 30000 });
  const text = (id) => page.getByTestId(id).innerText();
  await page.keyboard.press('Space');
  const drums = await peak(1200);
  check('Space starts the rhythm', drums > -30 && (await text('section')) === 'MAIN A', `${drums.toFixed(1)} dB`);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(100);
  check('digit 1 selects the I chord', (await text('chord')) === 'C');
  await page.keyboard.press('Digit6');
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(100);
  check('digit 6 then 7th modifier gives Am7', (await text('chord')) === 'Am7');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check('Enter triggers a fill', (await text('section')) === 'FILL');
  await page.keyboard.press('BracketRight');
  await page.waitForTimeout(2800);
  check('variation changes after the fill', (await text('section')) === 'MAIN B');
  const bpm0 = Number(await page.locator('input[type=number]').inputValue());
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  check('arrow keys change tempo', Number(await page.locator('input[type=number]').inputValue()) === bpm0 + 1);
  await page.keyboard.down('KeyH');
  await page.waitForTimeout(80);
  check('melody keys still play over the rhythm', (await lit()).includes('A4'));
  await page.keyboard.up('KeyH');
  await page.screenshot({ path: path.join(shots, 'arranger.png'), fullPage: true });
  await page.keyboard.press('Period');
  await page.waitForFunction(() => document.querySelector('[data-testid="section"]').textContent.toLowerCase().includes('stopped'), null, { timeout: 12000 }).catch(() => {});
  check('ending stops the rhythm', (await text('section')) === 'STOPPED');
  await page.keyboard.press('Slash');
  await page.waitForTimeout(100);
  check('sync start arms', (await text('section')) === 'SYNC ARMED');
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(300);
  check('first melody key starts the rhythm', (await text('section')).startsWith('MAIN'));
  await page.keyboard.press('Space');
  const styles = await page.locator('section[aria-label="Rhythm styles"] button').all();
  const silentStyles = [];
  for (const b of styles) {
    await b.click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="start-stop"]').disabled, null, { timeout: 30000 });
    await page.keyboard.press('Space');
    const p = await peak(600);
    await page.keyboard.press('Space');
    if (p < -30 || p > -0.5) silentStyles.push(`${(await b.innerText()).trim()}:${p.toFixed(1)}`);
  }
  check(`all ${styles.length} rhythm styles play at a sane level`, silentStyles.length === 0, silentStyles.join(' '));

  // --------------------------------------------------------------- Learn
  console.log('Learn');
  const code = (label) => ({ ';': 'Semicolon', "'": 'Quote' })[label] ?? `Key${label}`;
  await page.goto(`${base}/learn?song=mary-lamb`);
  await enableAudio();
  await page.keyboard.press('Space');
  await page.getByTestId('prompt').waitFor({ timeout: 5000 });
  const first = (await page.getByTestId('prompt').locator('.kbd').first().innerText()).trim();
  const hinted = await page.evaluate(() => [...document.querySelectorAll('.pkey.hint')].map((e) => e.getAttribute('aria-label')));
  check('wait mode prompts the laptop key for the first note', first === 'D' && hinted[0] === 'E4', `key ${first}, note ${hinted[0]}`);
  await page.screenshot({ path: path.join(shots, 'learn-wait.png') });
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(400);
  check('a wrong key is counted and the song does not advance', (await text('stat-wrong')) === '1' && (await page.getByTestId('prompt').locator('.kbd').first().innerText()).trim() === 'D');
  const t0 = Date.now();
  while (Date.now() - t0 < 90000 && !(await page.getByTestId('final-score').count())) {
    const p = page.getByTestId('prompt');
    if (await p.count()) {
      for (const l of await p.locator('.kbd').allInnerTexts()) await page.keyboard.press(code(l.trim()));
      await page.waitForTimeout(220);
    } else await page.waitForTimeout(40);
  }
  const score = (await page.getByTestId('final-score').innerText().catch(() => '')).replace(/\s/g, '');
  check('following the prompts completes the song with a score', /^9\d%$|^100%$/.test(score), score);
  await page.screenshot({ path: path.join(shots, 'learn-result.png') });

  await page.goto(`${base}/learn?song=fur-elise`);
  await enableAudio();
  await page.getByTestId('mode-listen').click();
  await page.keyboard.press('Space');
  let demoPeak = -Infinity;
  let demoLit = 0;
  for (let i = 0; i < 60; i++) {
    demoPeak = Math.max(demoPeak, await page.evaluate(() => window.__meter.getValue()));
    demoLit = Math.max(demoLit, await page.locator('.pkey.on').count());
    await page.waitForTimeout(50);
  }
  check('listen mode plays the song and lights keys', demoPeak > -45 && demoLit > 0, `${demoPeak.toFixed(1)} dB`);
  await page.screenshot({ path: path.join(shots, 'learn-listen.png') });
  await page.keyboard.press('Space');
  await page.getByTestId('mode-practice').click();
  await page.keyboard.press('Space');
  await page.waitForTimeout(3500);
  const missed = await page.locator('[aria-label="Live feedback"]').innerText();
  check('timed practice marks unplayed notes as missed', /\n?[1-9]\d*\s*\n?missed/.test(missed.replace(/\s+/g, ' ')) || /[1-9]\d* missed/.test(missed.replace(/\s+/g, ' ')), missed.replace(/\s+/g, ' ').slice(0, 60));
  await page.keyboard.press('Space');

  // --------------------------------------------------------- MIDI import
  console.log('MIDI Import');
  const { Midi } = require(path.join(__dirname, '..', 'node_modules', '@tonejs', 'midi'));
  const m = new Midi();
  m.name = 'Smoke Test Tune';
  m.header.setTempo(100);
  const mel = m.addTrack();
  mel.name = 'Lead';
  [72, 74, 76, 79, 84, 88, 91, 96].forEach((n, i) => mel.addNote({ midi: n, time: i * 0.6, duration: 0.5 }));
  const lh = m.addTrack();
  lh.name = 'Bass';
  [36, 43, 36, 43].forEach((n, i) => lh.addNote({ midi: n, time: i * 1.2, duration: 1 }));
  const dr = m.addTrack();
  dr.channel = 9;
  dr.addNote({ midi: 36, time: 0, duration: 0.1 });
  const tmp = path.join(os.tmpdir(), 'aurora-smoke.mid');
  fs.writeFileSync(tmp, Buffer.from(m.toArray()));
  await page.goto(`${base}/import`);
  await page.getByTestId('midi-file').setInputFiles(tmp);
  await page.getByTestId('tracks').waitFor();
  check('MIDI tracks are listed', (await page.locator('[data-testid="tracks"] tbody tr').count()) === 3);
  const analysis = await page.getByTestId('analysis').innerText();
  check('playability report explains the compromises', /outside the laptop range|octave changes automatically/i.test(analysis));
  check('saving requires the authorisation tick', await page.getByTestId('save-song').isDisabled());
  await page.locator('input[type=checkbox]').check();
  await page.getByTestId('save-song').click();
  await page.getByTestId('learn-imported').click();
  await page.waitForURL(/learn\?song=import-/);
  await page.locator('h1').filter({ hasText: 'Smoke Test Tune' }).waitFor({ timeout: 10000 });
  check('imported song opens in the tutor', true);
  await page.screenshot({ path: path.join(shots, 'learn-imported.png') });
  await page.goto(`${base}/library`);
  await page.getByTestId('song-list').waitFor();
  await page.locator('input[type=search]').fill('smoke');
  check('library search finds the imported song', (await page.locator('[data-testid="song-list"] li').count()) === 1);
  await page.locator('input[type=search]').fill('');
  check('library lists the built-in songs', (await page.locator('[data-testid="song-list"] li').count()) >= 17);
  await page.screenshot({ path: path.join(shots, 'library.png') });

  // -------------------------------------------------------------- Studio
  console.log('Recording Studio');
  await page.goto(`${base}/studio`);
  await enableAudio();
  await page.locator('section[aria-label="Record"] select').selectOption('0');
  await page.getByTestId('record').click();
  await page.waitForTimeout(400);
  for (const k of ['KeyA', 'KeyS', 'KeyD', 'KeyF']) {
    await page.keyboard.down(k);
    await page.waitForTimeout(220);
    await page.keyboard.up(k);
    await page.waitForTimeout(80);
  }
  await page.getByTestId('record').click();
  check('four played notes are recorded', (await page.getByTestId('take-info').innerText()) === '4 notes');
  await page.getByTestId('play-take').click();
  const playback = await peak(1200);
  check('the take plays back', playback > -45, `${playback.toFixed(1)} dB`);
  await page.waitForTimeout(800);
  const [midiDl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-midi').click()]);
  const midiPath = await midiDl.path();
  const back = new Midi(fs.readFileSync(midiPath));
  check('exported MIDI contains the performance', back.tracks[0].notes.map((n) => n.midi).join() === '60,62,64,65');
  const [wavDl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('export-wav').click()]);
  const wav = fs.readFileSync(await wavDl.path());
  let wavPeak = 0;
  for (let i = 44; i + 1 < wav.length; i += 2) wavPeak = Math.max(wavPeak, Math.abs(wav.readInt16LE(i)));
  check('exported WAV is a real rendered audio file', wav.toString('ascii', 0, 4) === 'RIFF' && wav.length > 100000 && wavPeak > 1500, `${(wav.length / 1024).toFixed(0)} kB, peak ${wavPeak}`);
  await page.getByTestId('save-take').click();
  await page.getByTestId('projects').waitFor();
  await page.screenshot({ path: path.join(shots, 'studio.png'), fullPage: true });
  await page.reload();
  await page.getByTestId('projects').waitFor({ timeout: 10000 });
  check('saved project survives a reload', (await page.locator('[data-testid="projects"] li').count()) === 1);

  // ------------------------------------------------------------ Settings
  console.log('Settings');
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyA');
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyG');
  await page.waitForTimeout(100);
  check('rollover tester counts held keys', (await text('max-keys')) === '3');
  for (const k of ['KeyA', 'KeyD', 'KeyG']) await page.keyboard.up(k);
  await page.getByTestId('preset-two-row').click();
  await page.goto(`${base}/play`);
  await enableAudio();
  await page.keyboard.down('KeyZ');
  await page.waitForTimeout(60);
  check('two-hand layout: Z plays C3', (await lit())[0] === 'C3');
  await page.keyboard.up('KeyZ');
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(60);
  check('two-hand layout: Q plays C4', (await lit())[0] === 'C4');
  await page.keyboard.up('KeyQ');
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByTestId('preset-classic').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, 'settings.png') });

  // --------------------------------------------------------------- Mobile
  console.log('Touch / phone layout');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mp = await phone.newPage();
  await mp.goto(`${base}/play`);
  await mp.getByTestId('enable-audio').tap();
  await mp.waitForFunction(() => !document.querySelector('[data-testid="enable-audio"]') && !document.querySelector('[role="status"]')?.textContent?.includes('Loading'), null, { timeout: 30000 });
  const key = mp.locator('.pkey.white').nth(3);
  const box = await key.boundingBox();
  await mp.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.8);
  check('piano is usable on a phone-sized touch screen', (await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)) && box.width > 0);
  await mp.screenshot({ path: path.join(shots, 'phone-play.png') });
  await phone.close();

  const real = errors.filter((e) => !/favicon/.test(e));
  check('no console or page errors', real.length === 0, real.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} smoke check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
