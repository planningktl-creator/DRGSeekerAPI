const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test, expect } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..');
const API_ROOT = 'https://had-api.moph.go.th/cmi';
const DEFAULT_RESULT = {
  drg: '01550', mdc: '01', rw: 1.2, adjrw: 1.35, wtlos: 2.4, ot: '5',
  los: 5, err: 0, warn: 0
};

function defaultCalcBody() {
  return {
    status: 200,
    tgrp: { FileDescription: 'synthetic test grouper', ProductVersion: 'test' },
    data: [Object.assign({}, DEFAULT_RESULT)]
  };
}

function trackBrowserErrors(page) {
  const errors = { page: [], console: [] };
  page.on('pageerror', error => errors.page.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  return errors;
}

async function installMockApi(page, options = {}) {
  const requests = [];
  const posts = [];
  await page.route(`${API_ROOT}/**`, async route => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const pathname = new URL(url).pathname;
    requests.push({ method, url });

    if (method === 'POST' && pathname.endsWith('/drg/calculate')) {
      let body = {};
      try { body = request.postDataJSON() || {}; } catch (error) { /* route will return a controlled response */ }
      posts.push({ body, url });
      const custom = options.postHandler ? await options.postHandler(body, posts.length) : null;
      const reply = custom || { body: defaultCalcBody() };
      if (reply.delay) await new Promise(resolve => setTimeout(resolve, reply.delay));
      await route.fulfill({
        status: reply.httpStatus || 200,
        contentType: 'application/json',
        body: JSON.stringify(reply.body || {})
      });
      return;
    }

    const custom = options.getHandler ? await options.getHandler(pathname, request) : null;
    const reply = custom || defaultGetBody(pathname);
    if (reply.delay) await new Promise(resolve => setTimeout(resolve, reply.delay));
    await route.fulfill({
      status: reply.httpStatus || 200,
      contentType: 'application/json',
      body: JSON.stringify(reply.body || {})
    });
  });
  return { requests, posts };
}

function defaultGetBody(pathname) {
  if (pathname.endsWith('/libs/ipd-result')) {
    return { body: { rows: [{ code: '11', name_th: 'กลับบ้าน' }] } };
  }
  if (pathname.includes('/libs/icd10/')) {
    return { body: { rows: [{ icd10: 'I639', who_full_desc: 'Cerebral infarction, unspecified' }] } };
  }
  if (pathname.includes('/libs/icd-cm/')) {
    return { body: { rows: [{ icd: '8703', procedname: 'Synthetic procedure' }] } };
  }
  if (pathname.includes('/libs/drg-name/')) {
    return { body: { rows: [{ drgname: 'Synthetic DRG name' }] } };
  }
  if (pathname.includes('/libs/drg-error/')) {
    return { body: { rows: [{ name_th: 'Synthetic error' }] } };
  }
  if (pathname.includes('/libs/drg-warning/')) {
    return { body: { rows: [{ name_th: 'Synthetic warning' }] } };
  }
  return { body: { rows: [] } };
}

async function openApp(page, options = {}, entry = '/') {
  await page.addInitScript(legacyHistory => {
    if (sessionStorage.getItem('__drg_test_initialized')) return;
    localStorage.clear();
    if (legacyHistory) localStorage.setItem('ktl_drg_hist', JSON.stringify(legacyHistory));
    sessionStorage.setItem('__drg_test_initialized', '1');
  }, options.legacyHistory || null);
  const mock = await installMockApi(page, options);
  await page.goto(entry, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#btnCalc')).toBeAttached();
  return mock;
}

async function fillBasicCase(page) {
  await page.locator('#pdx').fill('I639');
}

async function addChipCodes(page, containerId, codes) {
  const input = page.locator(`#${containerId} .chip-input`);
  await input.fill(codes.join(','));
  await input.press('Enter');
}

async function calculate(page, expected = '01550') {
  await page.locator('#btnCalc').click();
  await expect(page.locator('#resultBody .drg-code')).toHaveText(expected);
}

test('static preflight keeps raw-static root and canonical web entrypoint', () => {
  const rootIndex = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const webIndex = fs.readFileSync(path.join(repoRoot, 'web', 'index.html'), 'utf8');
  assert.match(rootIndex, /web\/?/);
  assert.match(webIndex, /assets\/app\.js/);
  assert.match(webIndex, /assets\/styles\.css/);
  assert.equal(fs.existsSync(path.join(repoRoot, 'web', '.nojekyll')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'package.json')), false);
  const result = spawnSync(process.execPath, ['scripts/check-static.mjs'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('keyboard and accessibility semantics remain usable for validation and segmented controls', async ({ page }) => {
  await openApp(page, {}, '/web/');
  await expect(page.locator('#pdx')).toHaveAttribute('role', 'combobox');
  await expect(page.locator('#pdx')).toHaveAttribute('aria-controls', 'pdxAc');
  await expect(page.locator('#rememberHistory')).toHaveAttribute('aria-describedby', 'historyPrivacyNote');

  await page.locator('#sexSeg button').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#sexSeg button[data-sex="2"]')).toHaveAttribute('aria-checked', 'true');

  await page.locator('#pdx').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sdxChips .chip-input')).toBeFocused();
  await page.locator('#btnCalc').click();
  await expect(page.locator('#pdxError')).toBeVisible();
  await expect(page.locator('#pdx')).toHaveAttribute('aria-invalid', 'true');
});

test('root redirect and /web/ load without browser errors or overflow', async ({ page }) => {
  const errors = trackBrowserErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const mock = await openApp(page);
  await expect(page).toHaveURL(/\/web\/$/);
  await expect(page).toHaveTitle('KTL CMI DRG Seeker');
  await expect(page.locator('#rememberHistory')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(mock.requests.some(request => request.method === 'POST')).toBe(false);

  await page.goto('/web/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#btnCalcM')).toBeVisible();
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test('mocked calculation preserves version 6 wire contract and validates the response', async ({ page }) => {
  const mock = await openApp(page, {}, '/web/');
  await fillBasicCase(page);
  await calculate(page);
  await expect(page.locator('#btnCalc')).not.toHaveClass(/loading/);
  expect(mock.posts).toHaveLength(1);
  expect(mock.posts[0].url).toBe(`${API_ROOT}/drg/calculate`);
  expect(mock.posts[0].body.version).toBe('6');
  expect(mock.posts[0].body.data).toHaveLength(1);
  expect(mock.posts[0].body.data[0]).toMatchObject({ hcode: '10929', pdx: 'I639', sdx: [], proc: [] });
  expect(await page.locator('#resultBody').textContent()).toContain('01550');
});

test('malformed API response is rejected instead of rendering a blank result', async ({ page }) => {
  await openApp(page, {
    postHandler: async () => ({ body: { status: 200, data: [{}] } })
  }, '/web/');
  await fillBasicCase(page);
  await page.locator('#btnCalc').click();
  await expect(page.locator('#resultBody .alert.err')).toBeVisible();
  await expect(page.locator('#btnCalc')).toBeEnabled();
  await expect(page.locator('#loader')).not.toHaveClass(/show/);
});

test('non-200 HTTP responses are rejected even when the JSON body looks valid', async ({ page }) => {
  await openApp(page, {
    postHandler: async () => ({ httpStatus: 201, body: defaultCalcBody() })
  }, '/web/');
  await fillBasicCase(page);
  await page.locator('#btnCalc').click();
  await expect(page.locator('#resultBody .alert.err')).toBeVisible();
  await expect(page.locator('#btnCalc')).toBeEnabled();
});

test('input validation blocks invalid HCode, numeric values and SDx/Proc limits', async ({ page }) => {
  const mock = await openApp(page, {}, '/web/');
  await fillBasicCase(page);

  await page.locator('#hcode').fill('123456');
  await page.locator('#btnCalc').click();
  await expect(page.locator('#hcodeError')).toBeVisible();
  expect(await page.locator('#hcode').inputValue()).toBe('123456');
  expect(mock.posts).toHaveLength(0);

  await page.locator('#hcode').fill('12A34');
  await page.locator('#btnCalc').click();
  await expect(page.locator('#hcodeError')).toBeVisible();
  expect(mock.posts).toHaveLength(0);

  await page.locator('#hcode').fill('10929');
  await page.locator('#age').fill('121');
  await page.locator('#btnCalc').click();
  await expect(page.locator('#ageError')).toBeVisible();
  expect(mock.posts).toHaveLength(0);

  await page.locator('#age').fill('12.5');
  await page.locator('#btnCalc').click();
  await expect(page.locator('#ageError')).toBeVisible();
  expect(mock.posts).toHaveLength(0);

  await page.locator('#age').fill('65');
  await addChipCodes(page, 'sdxChips', Array.from({ length: 13 }, (_, i) => `D${String(i + 1).padStart(3, '0')}`));
  await page.locator('#btnCalc').click();
  await expect(page.locator('#sdxError')).toBeVisible();
  expect(mock.posts).toHaveLength(0);

  await page.locator('#btnReset').click();
  await fillBasicCase(page);
  await addChipCodes(page, 'procChips', Array.from({ length: 21 }, (_, i) => `P${String(i + 1).padStart(3, '0')}`));
  await page.locator('#btnCalc').click();
  await expect(page.locator('#procError')).toBeVisible();
  expect(mock.posts).toHaveLength(0);
});

test('comparison accepts up to 30 candidates and rejects candidate 31 before any request', async ({ page }) => {
  const dialogs = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const mock = await openApp(page, {}, '/web/');
  await fillBasicCase(page);
  const twentyNine = Array.from({ length: 29 }, (_, i) => `D${String(i + 1).padStart(3, '0')}`);
  await addChipCodes(page, 'sdxChips', twentyNine);
  await page.locator('#btnPermute').click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain('ทางเลือก');
  expect(mock.posts).toHaveLength(0);

  await addChipCodes(page, 'sdxChips', ['D030']);
  await page.locator('#btnPermute').click();
  await expect(page.locator('#sdxError')).toBeVisible();
  expect(mock.posts).toHaveLength(0);
});

test('POST calculation never falls back through a public proxy', async ({ page }) => {
  const mock = await openApp(page, {
    postHandler: async () => ({ httpStatus: 503, body: { error: 'synthetic outage' } })
  }, '/web/');
  await fillBasicCase(page);
  await page.locator('#btnCalc').click();
  await expect(page.locator('#resultBody .alert.err')).toBeVisible();
  expect(mock.posts).toHaveLength(1);
  expect(mock.posts[0].url).toBe(`${API_ROOT}/drg/calculate`);
  expect(mock.requests.some(request => /allorigins|corsproxy/i.test(request.url))).toBe(false);
});

test('history is memory-only by default, persists only after opt-in, and clears on opt-out', async ({ page }) => {
  const mock = await openApp(page, {}, '/web/');
  await fillBasicCase(page);
  await calculate(page);
  expect(await page.evaluate(() => ({
    history: localStorage.getItem('ktl_drg_hist'), recent: localStorage.getItem('ktl_drg_recent'),
    optIn: localStorage.getItem('ktl_drg_history_opt_in')
  }))).toEqual({ history: null, recent: null, optIn: null });
  await expect(page.locator('#histBody .hist-item')).toHaveCount(1);
  expect(mock.posts).toHaveLength(1);

  await page.locator('#rememberHistory').check();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ktl_drg_history_opt_in'))).toBe('1');
  expect(await page.evaluate(() => Boolean(localStorage.getItem('ktl_drg_hist')))).toBe(true);
  expect(await page.evaluate(() => Boolean(localStorage.getItem('ktl_drg_recent')))).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#rememberHistory')).toBeChecked();
  await expect(page.locator('#histBody .hist-item')).toHaveCount(1);
  await expect(page.locator('#pdx')).toHaveValue('I639');

  await page.locator('#rememberHistory').uncheck();
  expect(await page.evaluate(() => [
    localStorage.getItem('ktl_drg_hist'), localStorage.getItem('ktl_drg_recent'),
    localStorage.getItem('ktl_drg_history_opt_in')
  ])).toEqual([null, null, null]);
  await expect(page.locator('#histBody .hist-item')).toHaveCount(0);
});

test('legacy health storage without an opt-in flag is purged and not restored', async ({ page }) => {
  await openApp(page, {
    legacyHistory: [{ pdx: 'I639', hcode: '10929', age: 65, sdx: [], proc: [], ts: Date.now(), drg: '01550' }]
  }, '/web/');
  await expect(page.locator('#pdx')).toHaveValue('');
  await expect(page.locator('#histBody .hist-item')).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.getItem('ktl_drg_hist'), localStorage.getItem('ktl_drg_recent')])).toEqual([null, null]);
});

test('malicious API OT output is rendered as text in normal and comparison results', async ({ page }) => {
  const malicious = '<img src=x onerror="window.__xss=1">';
  await openApp(page, {
    postHandler: async () => ({ body: Object.assign(defaultCalcBody(), { data: [Object.assign({}, DEFAULT_RESULT, { ot: malicious })] }) })
  }, '/web/');
  await fillBasicCase(page);
  await calculate(page);
  expect(await page.locator('#resultBody img')).toHaveCount(0);
  expect(await page.locator('#resultBody').textContent()).toContain(malicious);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  await addChipCodes(page, 'sdxChips', ['I10']);
  await page.locator('#btnPermute').click();
  await expect(page.locator('#permTable tr[data-i]').first()).toBeVisible();
  expect(await page.locator('#resultBody img')).toHaveCount(0);
  expect(await page.locator('#resultBody').textContent()).toContain(malicious);
});

test('DRG error and warning dictionaries use the documented libs endpoints', async ({ page }) => {
  const requested = [];
  await openApp(page, {
    postHandler: async () => ({ body: Object.assign(defaultCalcBody(), {
      data: [Object.assign({}, DEFAULT_RESULT, { err: 1, warn: 1 })]
    }) }),
    getHandler: async pathname => {
      requested.push(pathname);
      if (pathname.endsWith('/libs/drg-error/1')) return { body: { rows: [{ name: 'Synthetic error' }] } };
      if (pathname.endsWith('/libs/drg-warning/1')) return { body: { rows: [{ name_th: 'Synthetic warning' }] } };
      return null;
    }
  }, '/web/');
  await fillBasicCase(page);
  await calculate(page);
  await expect(page.locator('#errTxt')).toHaveText('Synthetic error');
  await expect(page.locator('#warnTxt')).toHaveText('Synthetic warning');
  expect(requested.some(pathname => pathname.endsWith('/libs/drg-error/1'))).toBe(true);
  expect(requested.some(pathname => pathname.endsWith('/libs/drg-warning/1'))).toBe(true);
});

test('stale ICD autocomplete responses cannot overwrite the latest query', async ({ page }) => {
  await openApp(page, {
    getHandler: async pathname => {
      if (pathname.endsWith('/libs/icd10/I6')) return { delay: 350, body: { rows: [{ icd10: 'I600', who_full_desc: 'old' }] } };
      if (pathname.endsWith('/libs/icd10/I63')) return { delay: 20, body: { rows: [{ icd10: 'I639', who_full_desc: 'latest' }] } };
      if (pathname.endsWith('/libs/icd-cm/87')) return { delay: 350, body: { rows: [{ icd: '8700', procedname: 'old' }] } };
      if (pathname.endsWith('/libs/icd-cm/8703')) return { delay: 20, body: { rows: [{ icd: '8703', procedname: 'latest' }] } };
      return null;
    }
  }, '/web/');

  await page.locator('#pdx').fill('I6');
  await page.waitForTimeout(350);
  await page.locator('#pdx').fill('I63');
  await expect(page.locator('#pdxAc .ac-item .c')).toHaveText('I639');
  await page.waitForTimeout(450);
  expect(await page.locator('#pdxAc .ac-item .c').allTextContents()).toEqual(['I639']);

  const procInput = page.locator('#procChips .chip-input');
  await procInput.fill('87');
  await page.waitForTimeout(350);
  await procInput.fill('8703');
  await expect(page.locator('#procAc .ac-item .c')).toHaveText('8703');
  await page.waitForTimeout(450);
  expect(await page.locator('#procAc .ac-item .c').allTextContents()).toEqual(['8703']);
});

test('DRG metadata from an older calculation cannot replace current calculation metadata', async ({ page }) => {
  await openApp(page, {
    postHandler: async body => {
      const old = body.data[0].pdx === 'I639';
      return { body: Object.assign(defaultCalcBody(), { data: [Object.assign({}, DEFAULT_RESULT, { drg: old ? 'OLD01' : 'NEW02' })] }) };
    },
    getHandler: async pathname => {
      if (pathname.endsWith('/libs/drg-name/OLD01')) return { delay: 350, body: { rows: [{ drgname: 'ชื่อเก่า' }] } };
      if (pathname.endsWith('/libs/drg-name/NEW02')) return { delay: 20, body: { rows: [{ drgname: 'ชื่อใหม่' }] } };
      return null;
    }
  }, '/web/');
  await fillBasicCase(page);
  await calculate(page, 'OLD01');
  await expect(page.locator('#resultBody .drg-code')).toHaveText('OLD01');
  await page.waitForTimeout(40);
  await page.locator('#pdx').fill('A419');
  await page.locator('#btnCalc').click();
  await expect(page.locator('#resultBody .drg-code')).toHaveText('NEW02');
  await expect(page.locator('#drgNameRow')).toHaveText('ชื่อใหม่');
  await page.waitForTimeout(450);
  await expect(page.locator('#drgNameRow')).toHaveText('ชื่อใหม่');
});

test('permute failure and stop paths always recover BUSY, loader and buttons', async ({ page, context }) => {
  const mock = await openApp(page, {
    postHandler: async (body, index) => index === 1
      ? { httpStatus: 503, body: { error: 'synthetic baseline failure' } }
      : { body: defaultCalcBody() }
  }, '/web/');
  await fillBasicCase(page);
  await addChipCodes(page, 'sdxChips', ['I10']);
  await page.locator('#btnPermute').click();
  await expect(page.locator('#permTable')).toBeVisible();
  await expect(page.locator('#btnCalc')).toBeEnabled();
  await expect(page.locator('#loader')).not.toHaveClass(/show/);
  expect(mock.posts.length).toBeGreaterThanOrEqual(3);

  const slowPage = await context.newPage();
  const slow = await openApp(slowPage, { postHandler: async () => ({ delay: 500, body: defaultCalcBody() }) }, '/web/');
  await fillBasicCase(slowPage);
  await addChipCodes(slowPage, 'sdxChips', ['I10']);
  await slowPage.locator('#btnPermute').click();
  await expect(slowPage.locator('#btnStopPerm')).toBeVisible();
  await slowPage.evaluate(() => document.getElementById('btnStopPerm').click());
  await expect(slowPage.locator('#btnCalc')).toBeEnabled();
  await expect(slowPage.locator('#loader')).not.toHaveClass(/show/);
  await expect(slowPage.locator('#caseStatus')).not.toHaveAttribute('data-state', 'working');
  expect(slow.posts.length).toBeGreaterThanOrEqual(1);
  await slowPage.close();
});
