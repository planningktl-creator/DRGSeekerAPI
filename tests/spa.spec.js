import { test, expect } from '@playwright/test';

const API_ROOT = 'https://had-api.moph.go.th/cmi';

async function mockApi(page) {
  await page.route(`${API_ROOT}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/cmi/', '');

    if (path === 'libs/ipd-result') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [{ code: '11', name_th: 'กลับบ้าน' }] }),
      });
      return;
    }
    if (path.startsWith('libs/icd10/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [{ icd10: 'I639', who_full_desc: 'Cerebral infarction, unspecified' }] }),
      });
      return;
    }
    if (path.startsWith('libs/icd-cm/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [{ icd: '4709', procedname: 'Appendectomy' }] }),
      });
      return;
    }
    if (path === 'libs/drg-name/01550') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [{ drgname: 'Cerebral infarction' }] }),
      });
      return;
    }
    if (path === 'drg/calculate' && request.method() === 'POST') {
      const payload = request.postDataJSON();
      const patient = payload.data[0];
      expect(patient.sdx.length).toBeLessThanOrEqual(10);
      expect(patient.proc.length).toBeLessThanOrEqual(20);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 200,
          tgrp: { FileDescription: 'TGrp6305', ProductVersion: '6.3.5' },
          data: [{ drg: '01550', mdc: '01', rw: 1.1574, adjrw: 1.1574, wtlos: 5.2, ot: 0, err: 0, warn: 0, los: patient.los_day }],
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ rows: [] }) });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('calculates a case and restores the complete case from local history', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto('/');
  await expect(page.locator('#dcStatus option')).toHaveCount(1);
  await page.fill('#hcode', '10929');
  await page.fill('#baseRate', '4000');
  await page.click('[data-sex="2"]');
  await page.fill('#pdx', 'I639');
  await page.locator('#sdxChips .chip-input').fill('I10');
  await page.locator('#sdxChips .chip-input').press('Enter');
  await page.locator('#procChips .chip-input').fill('4709');
  await page.locator('#procChips .chip-input').press('Enter');
  await page.getByRole('button', { name: 'คำนวณ DRG' }).click();

  await expect(page.locator('.drg-code')).toHaveText('01550');
  await expect(page.locator('#drgNameRow')).toHaveText('Cerebral infarction');
  await expect(page.locator('#histBody .hist-item')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('#hcode')).toHaveValue('10929');
  await expect(page.locator('#baseRate')).toHaveValue('4000');
  await expect(page.locator('[data-sex="2"]')).toHaveClass(/on/);
  await expect(page.locator('#pdx')).toHaveValue('I639');
  await expect(page.locator('#sdxChips .chip')).toContainText('I10');
  await expect(page.locator('#procChips .chip')).toContainText('4709');
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('serves the SPA on a deep link without mobile horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/cases/preview');
  await expect(page).toHaveTitle('KTL CMI DRG Seeker');
  await expect(page.locator('#btnCalcM')).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});

test('blocks invalid HCode and caps SDx at the API-supported limit', async ({ page }) => {
  await page.goto('/');
  await page.fill('#hcode', '123');
  await page.fill('#pdx', 'I639');
  await page.getByRole('button', { name: 'คำนวณ DRG' }).click();
  await expect(page.locator('#hcodeError')).toBeVisible();

  await page.fill('#hcode', '10929');
  await page.locator('#sdxChips .chip-input').fill('I10 E119 E789 N189 J449 I509 I489 J189 A419 N390 I11');
  await page.locator('#sdxChips .chip-input').press('Enter');
  await expect(page.locator('#sdxChips .chip')).toHaveCount(10);
});
