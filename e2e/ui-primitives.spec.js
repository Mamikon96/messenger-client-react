const { test, expect } = require('@playwright/test');

const login = async (page) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Войти через Google' }).click();
  await expect(page.getByRole('button', { name: 'Mock google user' })).toBeVisible();
};

test('кнопка при фокусе с клавиатуры получает видимую обводку', async ({ page }) => {
  await login(page);
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus-visible');
  await expect(focused).toHaveCount(1);
  const outline = await focused.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThan(0);
});

test('поле формы Join при фокусе получает обводку акцентным цветом темы', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Название чата' });
  await input.focus();
  const { outline, accent } = await input.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-accent)';
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return { outline: getComputedStyle(el).outlineColor, accent };
  });
  expect(outline).toBe(accent);
});
