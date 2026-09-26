// Records the Homework 3 (Smart Diff) demo against the local stack (web :3200, API :3201).
// Scenes are paced by the voiceover: say(n) starts line n; the next say() waits until it ends.
// Every API request is logged; the only non-GET expected is the one POST /pulls/:id/review.
const { chromium } = require('playwright');
const fs = require('fs');

const WEB = 'http://localhost:3200';
const API = 'http://localhost:3201';
const R = '57bbf045-f4fb-4d57-bd66-80f5b9770243';
const PR_NUMBER = 21;
const PR_ID = '634ef3f6-cd67-4799-9c10-3ba337a4072e';
const GH = 'https://github.com/HlibHav/dev-digest';
const DUR = JSON.parse(fs.readFileSync('vo/durations.json', 'utf8')); // index 1..10 (seconds)
const GAP = 0.6;

const OVERLAY = `
(() => {
  const init = () => {
    if (document.getElementById('__cap')) return;
    const cap = document.createElement('div');
    cap.id = '__cap';
    Object.assign(cap.style, {position:'fixed',left:'50%',bottom:'28px',transform:'translateX(-50%)',
      maxWidth:'900px',padding:'12px 22px',borderRadius:'10px',background:'rgba(10,10,12,0.92)',
      border:'1px solid rgba(255,255,255,0.18)',color:'#fff',font:'600 19px/1.4 -apple-system,Segoe UI,sans-serif',
      zIndex:2147483647,textAlign:'center',pointerEvents:'none',display:'none',boxShadow:'0 6px 30px rgba(0,0,0,.5)'});
    document.documentElement.appendChild(cap);
    const mk = document.createElement('div');
    mk.id = '__mk';
    Object.assign(mk.style, {position:'fixed',right:'0',bottom:'0',width:'8px',height:'8px',zIndex:2147483647,pointerEvents:'none',
      background: sessionStorage.getItem('__mkc') || 'rgb(0,0,0)'});
    document.documentElement.appendChild(mk);
    const cur = document.createElement('div');
    cur.id = '__cur';
    Object.assign(cur.style, {position:'fixed',left:'0',top:'0',width:'18px',height:'18px',borderRadius:'50%',
      background:'rgba(255,255,255,0.85)',border:'2px solid rgba(0,0,0,0.6)',zIndex:2147483647,pointerEvents:'none',
      transform:'translate(-50%,-50%)',transition:'width .1s,height .1s'});
    document.documentElement.appendChild(cur);
    const last = JSON.parse(sessionStorage.getItem('__curpos') || '[720,450]');
    cur.style.left = last[0] + 'px'; cur.style.top = last[1] + 'px';
    const saved = sessionStorage.getItem('__captext');
    if (saved) { cap.textContent = saved; cap.style.display = 'block'; }
    window.addEventListener('mousemove', e => { cur.style.left = e.clientX+'px'; cur.style.top = e.clientY+'px';
      sessionStorage.setItem('__curpos', JSON.stringify([e.clientX,e.clientY])); }, true);
    window.addEventListener('mousedown', () => { cur.style.width='12px'; cur.style.height='12px'; }, true);
    window.addEventListener('mouseup', () => { cur.style.width='18px'; cur.style.height='18px'; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();

  // Warm the routes so Next dev compiles before the take.
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    for (const u of [`/repos/${R}/pulls`, `/repos/${R}/pulls/${PR_NUMBER}?tab=diff`, `/repos/${R}/pulls/${PR_NUMBER}?tab=findings`]) {
      await p.goto(WEB + u); await sleep(2500);
    }
    await c.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const t0 = Date.now();
  fs.mkdirSync('take/frames', { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const i = frames.length;
    const f = `take/frames/${String(i).padStart(6, '0')}.jpg`;
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, ts: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });

  const api = [];
  page.on('request', r => { if (r.url().startsWith(API)) api.push(`${r.method()} ${r.url().replace(API, '')}`); });

  const caption = async (text, hold = 0) => {
    await page.evaluate(t => {
      sessionStorage.setItem('__captext', t);
      const c = document.getElementById('__cap'); if (!c) return;
      c.textContent = t; c.style.display = t ? 'block' : 'none';
    }, text).catch(() => {});
    if (hold) await sleep(hold);
  };
  const moveTo = async (loc) => {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (!b) return;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
    await sleep(250);
  };
  const click = async (loc, after = 900) => { await moveTo(loc); await loc.click(); await sleep(after); };
  const scroll = async (dy, steps = 6) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(90); } };

  const cues = [];
  let lineEnd = 0;
  const now = () => (Date.now() - t0) / 1000;
  const say = async (n, text) => {
    const wait = lineEnd - now();
    if (wait > 0) await sleep(wait * 1000);
    const t = now();
    cues.push({ n, t: +t.toFixed(3) });
    lineEnd = t + DUR[n] + GAP;
    await page.evaluate(n => {
      const c = `rgb(${n*12},200,${255-n*12})`;
      sessionStorage.setItem('__mkc', c);
      const m = document.getElementById('__mk'); if (m) m.style.background = c;
    }, n).catch(() => {});
    await caption(text);
  };
  const finish = async () => { const w = lineEnd - now(); if (w > 0) await sleep(w * 1000); };
  const tab = name => page.getByRole('button', { name: new RegExp(name) }).first();
  const activeRuns = async () => {
    const r = await fetch(`${API}/pulls/${PR_ID}/runs/active`).then(x => x.json()).catch(() => []);
    return Array.isArray(r) ? r.length : 0;
  };

  // 1. GitHub: the flat order
  await page.goto(`${GH}/pull/${PR_NUMBER}/files`);
  await sleep(1500);
  await say(1, 'Homework 3 · Smart Diff · fixture PR #21: GitHub shows the lock file next to the logic');
  await sleep(5000);
  await scroll(600, 8);

  // 2. DevDigest: Files changed, grouped
  await finish();
  await page.goto(`${WEB}/repos/${R}/pulls/${PR_NUMBER}?tab=diff`);
  await sleep(1500);
  await say(2, 'Files changed · core → tests → wiring → docs → boilerplate · docs and boilerplate collapsed');
  await sleep(2500);
  await moveTo(page.getByText('Core', { exact: true }).first());
  await sleep(1500);
  await scroll(900, 10);
  await sleep(1500);
  await moveTo(page.getByText('Docs', { exact: true }).first());

  // 3. Boilerplate holds the lock file; package.json under wiring
  await say(3, 'Boilerplate holds pnpm-lock.yaml · package.json goes to wiring (pinned in the test table)');
  await click(page.getByText('Boilerplate', { exact: true }).first(), 1200);
  await moveTo(page.getByText('server/pnpm-lock.yaml').first());
  await sleep(2500);
  await moveTo(page.getByText('server/package.json').first());
  await sleep(1500);

  // 4. Run review
  await finish();
  await page.keyboard.press('Home');
  await sleep(800);
  await say(4, 'No review yet → no counters · Run Review → General Reviewer');
  await moveTo(page.getByText('No review has run yet').first());
  await sleep(1500);
  await click(page.getByRole('button', { name: 'Run Review' }).first(), 1200);
  await click(page.getByText('General Reviewer').first(), 2500);

  // 5. Back to Files changed, wait for the run
  await say(5, 'The run streams on Agent runs · back on Files changed the counters update by themselves');
  await sleep(4000);
  await click(tab('Files changed'), 1500);
  const started = now();
  while ((await activeRuns()) > 0 && now() - started < 75) await sleep(1500);
  await sleep(5500); // let the 4s poll + refetch land

  // 6. Counter and dot
  await say(6, 'Core ● 1 = one FILE with findings · the file card has its dot');
  await moveTo(page.getByText('Core', { exact: true }).first());
  await sleep(2500);
  await moveTo(page.getByText('server/src/modules/pulls/age.ts').first());
  await sleep(2000);

  // 7. Line 10: stripe, label, card
  await finish();
  await say(7, 'Line 10 · stripe + WARNING label · the FindingCard sits under the line');
  await moveTo(page.getByText(/^warning$/).first());
  await sleep(2500);
  await moveTo(page.getByText('Suggested fix', { exact: false }).first());
  await sleep(2000);

  // 8. Accept, toggle
  await finish();
  await say(8, 'Accept works here · one toggle hides GitHub comments and findings together');
  await click(page.getByRole('button', { name: 'Accept' }).first(), 2500);
  await click(page.getByRole('button', { name: /Hide comments & findings/ }).first(), 2500);
  await click(page.getByRole('button', { name: /Show comments & findings/ }).first(), 1500);

  // 9. Original order and back
  await finish();
  await say(9, 'Original order = GitHub’s flat list, findings included · Smart order brings the groups back');
  await click(page.getByRole('button', { name: 'Original order' }).first(), 1200);
  await scroll(700, 8);
  await sleep(1800);
  await scroll(-700, 6);
  await click(page.getByRole('button', { name: 'Smart order' }).first(), 1500);

  // 10. Why no model call
  await finish();
  await caption('');
  await page.goto(`${GH}/blob/feat/smart-diff/server/src/modules/smart-diff/constants.ts`);
  await sleep(1500);
  await say(10, 'No model call: pure path classifier · ordered rules in one constants file · works before the first review');
  await sleep(3000);
  await scroll(500, 8);
  await finish();
  await caption('', 800);

  fs.writeFileSync('take/cues.json', JSON.stringify(cues, null, 1));
  await cdp.send('Page.stopScreencast').catch(() => {});
  fs.writeFileSync('take/frames.json', JSON.stringify({ t0: t0 / 1000, end: Date.now() / 1000, frames }));

  await ctx.close();
  await browser.close();

  fs.writeFileSync('take/api-requests.log', api.join('\n') + '\n');
  const nonGet = api.filter(l => !l.startsWith('GET ') && !l.startsWith('OPTIONS '));
  console.log(`API requests: ${api.length}, non-GET: ${nonGet.length}`);
  console.log(nonGet.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
