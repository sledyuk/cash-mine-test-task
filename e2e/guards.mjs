// End-to-end guard checks against the running dev server and the real task API,
// in a 390px phone viewport using the locally installed Chrome.
// The token comes from the environment only; it is never written to the repo.
//
// Usage: TOKEN=<your token> BASE=http://localhost:8081 OUT=/tmp/shots npm run e2e
//
// Note: this creates real claims (10 USDT each) on the token's test data.
import { chromium } from 'playwright-core';

const { TOKEN, BASE = 'http://localhost:8081', OUT = '.' } = process.env;
if (!TOKEN) {
  console.error('Set TOKEN to your API token.');
  process.exit(2);
}
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

// Log every claim POST: idempotency key, status, replay header.
const posts = [];
context.on('request', (req) => {
  if (req.method() === 'POST' && req.url().endsWith('/v1/claims')) {
    posts.push({ key: req.headers()['idempotency-key'], body: req.postData(), status: null });
  }
});
context.on('response', async (res) => {
  const req = res.request();
  if (req.method() === 'POST' && req.url().endsWith('/v1/claims')) {
    const entry = [...posts].reverse().find((p) => p.key === req.headers()['idempotency-key']);
    if (entry) {
      entry.status = res.status();
      entry.replayed = res.headers()['idempotent-replayed'] === 'true';
    }
  }
});

const pageErrors = [];
const page = await context.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));

async function getRecords(p) {
  return p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('cashmine.claims.'));
    return k ? JSON.parse(localStorage.getItem(k)) : [];
  });
}

async function startClaim(p, asset, amount) {
  await p.goto(`${BASE}/claim/${asset}`);
  await p.getByTestId('amount-input').waitFor({ timeout: 20000 });
  await p.getByTestId('amount-input').fill(amount);
  await p.getByTestId('review').click();
  await p.getByTestId('confirm').click();
  await p.waitForURL(/\/claims\//, { timeout: 15000 });
}

// 1. Token gate ----------------------------------------------------------------
await page.goto(BASE);
await page.getByText('Connect your account').waitFor({ timeout: 30000 });
check('asks for a token on first open', true);

await page.getByTestId('token-input').fill('not-a-real-token');
await page.getByTestId('token-save').click();
await page.getByText('This token was not accepted').waitFor({ timeout: 15000 });
check('rejects an invalid token with a clear message', true);

await page.getByTestId('token-input').fill(TOKEN);
await page.getByTestId('token-save').click();
await page.getByTestId('total-claimable').waitFor({ timeout: 20000 });
const stored = await page.evaluate(() => localStorage.getItem('cashmine.token'));
check('stores token in the browser and loads balances', stored === TOKEN);
const fresh = await page.getByTestId('freshness').innerText();
check('shows data freshness', /Snapshot .*checked/.test(fresh), fresh);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check('no horizontal overflow at 390px', overflow === 0, `${overflow}px`);
await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: true });

// 2. Amount validation ----------------------------------------------------------
await page.goto(`${BASE}/claim/USDT`);
await page.getByTestId('amount-input').waitFor({ timeout: 20000 });
for (const [input, expected] of [
  ['.5', 'Use digits'],
  ['5', 'Minimum claim is 10'],
  ['10.1234567', 'at most 6 decimal'],
  ['999999', 'more than your available'],
]) {
  await page.getByTestId('amount-input').fill(input);
  await page.getByTestId('review').click();
  const msg = await page
    .getByTestId('amount-error')
    .innerText()
    .catch(() => '');
  check(`validation: "${input}"`, msg.includes(expected), msg);
}
await page.getByTestId('max').click();
const maxValue = await page.getByTestId('amount-input').inputValue();
check('Max fills the exact available amount', /^\d+(\.\d+)?$/.test(maxValue), maxValue);
await page.getByTestId('amount-input').fill('10');
await page.screenshot({ path: `${OUT}/02-claim-form.png`, fullPage: true });

// 3. Happy path: submit, balance drops at once, settles --------------------------
const before = posts.length;
await page.getByTestId('review').click();
await page.screenshot({ path: `${OUT}/03-review.png`, fullPage: true });
await page.getByTestId('confirm').click();
await page.waitForURL(/\/claims\//, { timeout: 15000 });
await page.getByText(/Claim submitted|Claim completed|Claim failed/).waitFor({ timeout: 20000 });
const happy = posts.slice(before);
// The real API can 504 on its own; any retry must reuse the key and body.
check(
  'happy path: one key and body for every attempt, one claim created',
  happy.length >= 1 &&
    happy.every((p) => p.key === happy[0].key && p.body === happy[0].body) &&
    happy.filter((p) => p.status === 201).length <= 1,
  JSON.stringify(happy.map((p) => ({ status: p.status, replayed: p.replayed }))),
);
await page.screenshot({ path: `${OUT}/04-status-pending.png`, fullPage: true });
await page.getByText(/Claim completed|Claim failed/).waitFor({ timeout: 40000 });
check('happy path: claim settles via polling', true);

// 4. Lost response: same key replayed, never a second claim ---------------------
// Abort the response of the first POST at the network layer AFTER the server got it.
let dropped = 0;
await context.route('**/v1/claims', async (route) => {
  if (route.request().method() !== 'POST' || dropped > 0) return route.fallback();
  dropped++;
  await route.fetch(); // the server receives and processes it
  await route.abort('connectionreset'); // ...but the app never sees the answer
});
const beforeLost = posts.length;
await startClaim(page, 'USDT', '10');
await page.getByText("We're confirming your claim").waitFor({ timeout: 15000 });
check('lost response: shows "confirming", not an error or success', true);
await page.screenshot({ path: `${OUT}/05-unknown.png`, fullPage: true });
await page.getByText(/found the claim you already submitted/).waitFor({ timeout: 30000 });
const lostPosts = posts.slice(beforeLost);
const sameKey = lostPosts.every((p) => p.key === lostPosts[0].key);
const sameBody = lostPosts.every((p) => p.body === lostPosts[0].body);
check(
  'lost response: retried with the same key and body, server replayed',
  lostPosts.length >= 2 && sameKey && sameBody && lostPosts.at(-1).replayed === true,
  JSON.stringify(
    lostPosts.map((p) => ({ key: p.key.slice(0, 8), status: p.status, replayed: p.replayed })),
  ),
);
await context.unroute('**/v1/claims');

// 5. Unreachable server + reload + second tab -----------------------------------
await context.route('**/v1/claims', (route) =>
  route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.fallback(),
);
await startClaim(page, 'USDT', '10');
await page.getByText("We're confirming your claim").waitFor({ timeout: 15000 });
const unresolvedKey = (await getRecords(page)).find((r) => r.phase === 'unknown')?.key;
check('offline: record persisted before sending', !!unresolvedKey);

await page.reload();
await page.getByText("We're confirming your claim").waitFor({ timeout: 20000 });
check('offline: still confirming after a reload (key survives)', true);

const tabB = await context.newPage();
await tabB.goto(`${BASE}/claim/USDT`);
await tabB.getByText('A claim is still being confirmed').waitFor({ timeout: 20000 });
check('second tab: new USDT claim blocked while outcome unknown', true);
await tabB.screenshot({ path: `${OUT}/06-tab-b-blocked.png`, fullPage: true });

await page.goto(BASE);
await page.getByTestId('total-claimable').waitFor({ timeout: 20000 });
const homeText = await page.innerText('body');
check(
  'home: balance already reflects the unconfirmed claim',
  /Includes your claim of 10 USDT/.test(homeText),
);
await page.screenshot({ path: `${OUT}/07-home-inflight.png`, fullPage: true });

await context.unroute('**/v1/claims');
await page.goto(`${BASE}/claims/${unresolvedKey}`);
await page
  .getByTestId('check-now')
  .click()
  .catch(() => {});
await page.getByText(/Claim submitted|Claim completed|Claim failed/).waitFor({ timeout: 40000 });
const keyPosts = posts.filter((p) => p.key === unresolvedKey);
check(
  'recovered: claim created once the server is reachable, same key throughout',
  keyPosts.some((p) => p.status === 201 || p.status === 200),
  JSON.stringify(keyPosts.map((p) => p.status)),
);
await tabB.close();

// 6. Activity: exactly one claim per key ----------------------------------------
await page.goto(`${BASE}/activity`);
await page.getByText(/Claim/).first().waitFor({ timeout: 20000 });
const records = await getRecords(page);
const claimIds = records.filter((r) => r.claim).map((r) => r.claim.id);
const api = await fetch('https://task-api.cashmine.io/v1/activity?limit=20', {
  headers: { Authorization: `Bearer ${TOKEN}` },
}).then((r) => r.json());
const apiClaims = api.items.filter((i) => i.type === 'claim' && claimIds.includes(i.relatedId));
const perClaim = claimIds.map((id) => apiClaims.filter((i) => i.relatedId === id).length);
check(
  'server ledger: one activity entry per claim (no duplicates)',
  perClaim.every((n) => n <= 1),
  `claims=${claimIds.length} entries=${JSON.stringify(perClaim)}`,
);
await page.screenshot({ path: `${OUT}/08-activity.png`, fullPage: true });

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
