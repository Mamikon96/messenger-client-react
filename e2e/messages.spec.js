const { test, expect } = require('@playwright/test');

const login = async (page) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Войти через Google' }).click();
  await expect(page.getByRole('button', { name: 'Mock google user' })).toBeVisible();
};

const createChat = async (page, title) => {
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('input[name="title"]').fill(title);
  await page.locator('input[name="name"]').fill('Mock');
  await page.locator('.join-form').getByRole('button', { name: 'Join' }).click();
  // popover после Join не закрывается сам (FE-03) — закрываем кликом по оверлею
  await page.locator('.overlay').click({ position: { x: 5, y: 5 } });
  await page.locator('.chat', { hasText: title }).click();
};

test('сообщение отправляется кнопкой и Enter, поле очищается', async ({ page }) => {
  await login(page);
  await createChat(page, 'Room A');

  const input = page.locator('.dialog__footer-input');
  await input.fill('Первое');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.dialog__content').getByText('Первое')).toBeVisible();
  await expect(input).toHaveValue('');

  await input.fill('Второе');
  await input.press('Enter');
  await expect(page.locator('.dialog__content').getByText('Второе')).toBeVisible();
  await expect(input).toHaveValue('');
});

test('сообщения не смешиваются между чатами', async ({ page }) => {
  await login(page);
  await createChat(page, 'Room A');
  await page.locator('.dialog__footer-input').fill('Только в A');
  await page.locator('.dialog__footer-input').press('Enter');

  await createChat(page, 'Room B');

  await expect(page.locator('.dialog__content').getByText('Только в A')).toHaveCount(0);
});

test('после выхода сообщения предыдущего пользователя не видны', async ({ page }) => {
  await login(page);
  await createChat(page, 'Room A');
  await page.locator('.dialog__footer-input').fill('Секрет');
  await page.locator('.dialog__footer-input').press('Enter');
  await expect(page.getByText('Секрет')).toBeVisible();

  await page.getByRole('button', { name: 'Mock google user' }).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.getByRole('link', { name: 'Войти через Google' }).click();

  await expect(page.getByRole('button', { name: 'Mock google user' })).toBeVisible();
  await expect(page.getByText('Секрет')).toHaveCount(0);
});
