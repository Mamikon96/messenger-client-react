const { test, expect } = require('@playwright/test');

const theme = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

test.describe('тема', () => {
  test('[UC-THEME-01] без выбора тема следует системной (тёмной)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await theme(page)).toBe('dark');
  });

  test('[UC-THEME-01] без выбора тема следует системной (светлой)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    expect(await theme(page)).toBe('light');
  });

  test('[UC-THEME-03] тема выставляется инлайн-скриптом до загрузки React (без вспышки)', async ({ page }) => {
    await page.route('**/static/js/**', (route) => route.abort());
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await theme(page)).toBe('dark');
  });

  test('[UC-THEME-02] сохранённый выбор сильнее системной темы и переживает перезагрузку', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.reload();
    expect(await theme(page)).toBe('dark');
    await page.reload();
    expect(await theme(page)).toBe('dark');
  });

  test('[UC-THEME-01] в режиме system смена системной темы применяется без перезагрузки', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    expect(await theme(page)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => theme(page)).toBe('dark');
  });

  test('[UC-THEME-01] фон страницы берётся из токенов выбранной темы', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(light);
  });

  test('[UC-THEME-03] недоступный localStorage не ломает инлайн-скрипт: тема следует системной', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('denied'); };
    });
    await page.route('**/static/js/**', (route) => route.abort());
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await theme(page)).toBe('dark');
  });
});
