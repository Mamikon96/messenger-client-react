const { test, expect } = require('@playwright/test');
const { login, userMenuButton } = require('./helpers/auth');

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

  test('[UC-THEME-05] выбор «Тёмная» в меню применяется сразу и переживает перезагрузку', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await login(page);
    expect(await theme(page)).toBe('light');

    await userMenuButton(page).click();
    await page.getByRole('radio', { name: 'Тёмная' }).click();

    expect(await theme(page)).toBe('dark');
    await expect(page.getByRole('radio', { name: 'Тёмная' })).toBeChecked();
    await page.reload();
    expect(await theme(page)).toBe('dark');
    await userMenuButton(page).click();
    await expect(page.getByRole('radio', { name: 'Тёмная' })).toBeChecked();
  });

  test('[UC-THEME-05] меню закрывается по Esc (фокус на кнопке) и по клику снаружи', async ({ page }) => {
    await login(page);

    await userMenuButton(page).click();
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
    await expect(userMenuButton(page)).toHaveAttribute('aria-controls', /.+/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Выйти' })).toHaveCount(0);
    await expect(userMenuButton(page)).toBeFocused();

    await userMenuButton(page).click();
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
    // mousedown по неинтерактивному <main> — вне меню, без зависимости от раскладки
    await page.getByRole('main').dispatchEvent('mousedown');
    await expect(page.getByRole('button', { name: 'Выйти' })).toHaveCount(0);
  });

  test('[UC-THEME-05] открытое меню целиком помещается в окно', async ({ page }) => {
    await login(page);

    await userMenuButton(page).click();

    const menu = await page.getByRole('group', { name: 'Тема' }).locator('..').boundingBox();
    const viewport = page.viewportSize();
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
  });
});
