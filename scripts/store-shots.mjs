/* Takes the Chrome Web Store screenshots (1280 × 800) of the pack opening, from the lab, with a
 * headless Chrome driven over the DevTools protocol (real clicks, so the opening accepts them).
 * Run from the repository root: node scripts/store-shots.mjs
 * Needs Google Chrome, and a network connection (the lab's cards show the site's pictures).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'store/images');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The repository, served as the lab expects it.
const server = createServer((request, response) => {
  const path = join(ROOT, decodeURIComponent(new URL(request.url, 'http://x').pathname));
  try {
    if (!statSync(path).isFile()) throw new Error();
    response.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(readFileSync(path));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'wr-shots-'))}`,
  '--window-size=1280,800', '--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

let page;
for (let attempt = 0; attempt < 50 && !page; attempt += 1) {
  await sleep(200);
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(target => target.type === 'page'); } catch { /* Not up yet. */ }
}
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});
const send = (method, params = {}) => new Promise(resolve => {
  sequence += 1;
  pending.set(sequence, resolve);
  socket.send(JSON.stringify({ id: sequence, method, params }));
});
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
async function click(x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}
async function shot(name) {
  const { result } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(result.data, 'base64'));
  console.log(`store/images/${name}`);
}
// Where an element of the opening is, by selector, in the shadow root.
const centerOf = selector => evaluate(`(() => {
  const node = document.querySelector('[data-wme=pack-opening]')?.shadowRoot?.querySelector(${JSON.stringify(selector)});
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
})()`);
const phase = () => evaluate("document.querySelector('[data-wme=pack-opening]')?.shadowRoot?.querySelector('.root')?.dataset.phase");
async function waitPhase(name, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await phase() === name) return true;
    await sleep(100);
  }
  return false;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

async function open(design, scenario) {
  await send('Page.navigate', { url: `${origin}/lab/pack-opening.html` });
  await sleep(1200);
  await evaluate(`localStorage.setItem('packDesign', ${JSON.stringify(design)}); localStorage.setItem('packAntiSpoil', 'false'); true`);
  await send('Page.reload');
  await sleep(1500);
  await evaluate(`[...document.querySelectorAll('#scenarios button')].find(b => b.textContent === ${JSON.stringify(scenario)}).click(), true`);
  await waitPhase('ready');
  await sleep(1400);
}

// 1. The globe pack (the default), ready to be cut.
await open('globe', 'Légendaire');
await shot('screenshot-1-paquet.png');
// 2. The opening: the pieces fly out with their ribbons.
const button = await centerOf('.pack-open-button');
await click(...button);
await sleep(1500);
await shot('screenshot-2-ouverture.png');
// 3. The pile, a card being revealed.
await waitPhase('deck');
await sleep(900);
const deck = await centerOf('.deck');
await click(...deck);
await sleep(1100);
await shot('screenshot-3-revelation.png');
// 4. The summary, after the rest is revealed.
await evaluate(`(() => { const b = [...document.querySelector('[data-wme=pack-opening]').shadowRoot.querySelectorAll('.hud button')].find(b => /Tout/.test(b.textContent) && !b.hidden); b?.click(); return true; })()`);
await waitPhase('summary', 20000);
await sleep(2200);
await shot('screenshot-4-recapitulatif.png');
// 5. A card's sheet.
await evaluate(`(() => { const cards = [...document.querySelector('[data-wme=pack-opening]').shadowRoot.querySelectorAll('.summary .card')]; cards[cards.length - 1].click(); return true; })()`);
await sleep(1200);
await shot('screenshot-5-fiche.png');
// 6. The dark pack.
await open('dark', 'Rare');
await shot('screenshot-6-paquet-sombre.png');

socket.close();
chrome.kill();
server.close();
