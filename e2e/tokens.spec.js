const { test, expect } = require('@playwright/test');

const token = (page, name) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test.describe('дизайн-токены', () => {
  test('токены доступны на странице в светлой теме по умолчанию', async ({ page }) => {
    await page.goto('/');
    expect(await token(page, '--color-bg')).not.toBe('');
    expect(await token(page, '--color-accent')).not.toBe('');
    expect(await token(page, '--space-4')).not.toBe('');
  });

  test('атрибут data-theme="dark" подменяет цвета', async ({ page }) => {
    await page.goto('/');
    const light = await token(page, '--color-bg');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const dark = await token(page, '--color-bg');
    expect(dark).not.toBe('');
    expect(dark).not.toBe(light);
  });

  test('в тёмной теме подменяются акцент и текст', async ({ page }) => {
    await page.goto('/');
    const light = [await token(page, '--color-accent'), await token(page, '--color-text')];
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const dark = [await token(page, '--color-accent'), await token(page, '--color-text')];
    expect(dark[0]).not.toBe(light[0]);
    expect(dark[1]).not.toBe(light[1]);
  });

  test('prefers-reduced-motion обнуляет длительности анимаций', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await token(page, '--duration-normal')).toBe('0ms');
  });
});
