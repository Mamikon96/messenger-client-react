const { test, expect } = require('@playwright/test');

const login = async (page) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Войти через Google' }).click();
  await expect(page.getByRole('button', { name: 'Mock google user' })).toBeVisible();
};

// popover после Join не закрывается сам (FE-03) — закрываем кликом по оверлею
const createChat = async (page, title) => {
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('input[name="title"]').fill(title);
  await page.locator('input[name="name"]').fill('Mock');
  await page.locator('.join-form').getByRole('button', { name: 'Join' }).click();
  await page.locator('.overlay').click({ position: { x: 5, y: 5 } });
};

test('[UC-CHAT-01] кнопка Join создаёт чат с введённым названием в списке чатов', async ({ page }) => {
  await login(page);
  await expect(page.locator('.chat')).toHaveCount(0);

  await createChat(page, 'Room A');

  await expect(page.locator('.chat', { hasText: 'Room A' })).toHaveCount(1);
});

test('[UC-CHAT-02] выбор чата открывает его диалог и подсвечивает его в списке', async ({ page }) => {
  await login(page);
  await createChat(page, 'Room A');
  await createChat(page, 'Room B');

  await page.locator('.chat', { hasText: 'Room A' }).click();
  await expect(page.locator('.dialog__header-title')).toHaveText('Room A');
  await expect(page.locator('.chat._active')).toHaveCount(1);
  await expect(page.locator('.chat._active')).toContainText('Room A');

  await page.locator('.chat', { hasText: 'Room B' }).click();
  await expect(page.locator('.dialog__header-title')).toHaveText('Room B');
  await expect(page.locator('.chat._active')).toContainText('Room B');
});
