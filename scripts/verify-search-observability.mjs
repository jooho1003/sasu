import { chromium, expect, request } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const baseURL = 'https://getsasu.com';
const result = { baseURL, checkedAt: new Date().toISOString(), checks: [], gaResponses: [], sentryResponses: [], sentryEventIds: [] };
const api = await request.newContext({ baseURL });
const browser = await chromium.launch();
try {
  for (const [path, text] of [['/robots.txt','Sitemap: https://getsasu.com/sitemap.xml'], ['/sitemap.xml','https://getsasu.com/privacy'], ['/llms.txt','https://getsasu.com/demo']]) {
    const response = await api.get(path);
    assert.equal(response.status(), 200);
    assert.ok((await response.text()).includes(text));
    result.checks.push(path);
  }
  const configResponse = await api.get('/api/telemetry/config');
  assert.equal(configResponse.status(), 200);
  const config = await configResponse.json();
  assert.equal(config.environment, 'production');
  assert.ok(config.dsn?.includes('4512210181423184'));
  assert.ok(configResponse.headers()['cache-control'].includes('no-store'));
  result.checks.push('production telemetry config');
  const login = await api.get('/login');
  assert.equal(login.status(), 200);
  assert.equal(login.headers()['x-robots-tag'], 'noindex, nofollow, noarchive');
  const demo = await api.get('/demo?demo=metadata', { maxRedirects: 0 });
  assert.equal(demo.status(), 200);
  assert.ok((await demo.text()).includes('rel="canonical" href="https://getsasu.com/demo"'));
  result.checks.push('read-only demo and login');
  const context = await browser.newContext();
  const page = await context.newPage();
  let gaPayloads = [];
  await page.route(/https:\/\/[^/]*google-analytics\.com\/g\/collect/u, async route => {
    const payload = `${route.request().url()} ${route.request().postData() ?? ''}`;
    assert.ok(!decodeURIComponent(payload).includes('PRIVATE_CANARY'));
    gaPayloads.push(payload);
    await route.continue();
  });
  page.on('response', response => {
    if (/google-analytics\.com\/g\/collect/u.test(response.url())) result.gaResponses.push(response.status());
    if (/sentry\.io\/api\/.*\/envelope/u.test(response.url())) result.sentryResponses.push(response.status());
  });
  await page.route('https://*.sentry.io/**/envelope/**', async route => {
    const body = route.request().postData() ?? '';
    assert.ok(!/PRIVATE_CANARY|user@example|업무 원문|token_hash|\/login/u.test(body));
    const event = JSON.parse(body.split('\n')[2]);
    assert.equal(event.sdk.settings.infer_ip, 'never');
    assert.ok(body.includes('application_error'));
    result.sentryEventIds.push(event.event_id);
    await route.continue();
  });
  assert.equal((await page.goto(baseURL + '/?token_hash=PRIVATE_CANARY#PRIVATE_CANARY')).status(),200);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https:\/\/getsasu\.com\/?$/u);
  const graph = JSON.parse(await page.locator('#sasu-structured-data').textContent());
  assert.equal(graph['@graph'].find(entry=>entry['@type']==='FAQPage').mainEntity.length,5);
  await page.screenshot({path:'docs/verification/52-search-observability/operating-home.png',fullPage:false});
  assert.equal(gaPayloads.length,0);
  await page.getByRole('button',{name:'방문 분석 허용',exact:true}).click();
  await expect.poll(()=>result.gaResponses.length,{timeout:45000}).toBeGreaterThan(0);
  assert.ok(result.gaResponses.every(status=>status===204||status===200));
  assert.ok(gaPayloads.some(payload=>payload.includes('en=page_view')&&payload.includes('tid=G-HLFXFGBGPD')));
  assert.ok(decodeURIComponent(gaPayloads.join('\n')).includes('dl=https://getsasu.com/'));
  result.checks.push('GA4 consent and actual clean collector receipt');
  const gaBeforeLogin = gaPayloads.length;
  await page.locator('.site-login').click();
  await expect(page).toHaveURL(/\/login/u);
  await expect(page.locator('#sasu-ga4')).toHaveCount(0);
  assert.equal(gaPayloads.length,gaBeforeLogin);
  await expect.poll(()=>page.evaluate(()=>Object.keys(window).includes('__SENTRY__')),{timeout:30000}).toBe(true);
  await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'PRIVATE_CANARY',error:new Error('PRIVATE_CANARY user@example.test 업무 원문'),filename:'https://getsasu.com/_next/static/chunks/verification.js?PRIVATE_CANARY',lineno:10,colno:2})));
  await expect.poll(()=>result.sentryResponses.length,{timeout:30000}).toBeGreaterThan(0);
  assert.ok(result.sentryResponses.every(status=>status===200));
  result.checks.push('private GA4 off and actual sanitized production Sentry receipt');
  result.status='passed';
} catch (error) {
  result.status='failed';
  result.failure=error.message;
  process.exitCode=1;
} finally {
  await writeFile('docs/verification/52-search-observability/operating-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  await browser.close();
  await api.dispose();
}
