const { test, expect } = require('@playwright/test');
const { login, userMenuButton } = require('./helpers/auth');

// Ошибка рендера вызывается в самом тесте, без тестовых хуков в коде приложения: данные проходят проверку формы API,
// а маркерное слово имени заставляет Array.from (инициалы в Avatar) бросить исключение.
const BROKEN_NAME = 'Жертва Рендера';

const breakArrayFromOnVictim = () => {
  const arrayFrom = Array.from;
  Array.from = (source, ...rest) => {
    if (source === 'Жертва') throw new Error('render failure');
    return arrayFrom.call(Array, source, ...rest);
  };
};

// Dev-сервер показывает поверх страницы оверлей ошибки (iframe) и перехватывает указатель: кнопки нажимаются событием click напрямую.
const clickBehindOverlay = (locator) => locator.dispatchEvent('click');

const fallback = (page) => page.getByRole('alert').filter({ hasText: 'Что-то пошло не так' });

test('[UC-UI-03] ошибка в мессенджере: сообщение и «Повторить», остальное приложение на месте', async ({ page }) => {
  await page.addInitScript(breakArrayFromOnVictim);
  await login(page);
  let broken = true;
  await page.route(/\/api\/users(\?|$)/, (route) =>
    route.fulfill({ json: broken ? [{ id: 'u-broken', name: BROKEN_NAME, avatarUrl: '' }] : [] }));

  await page.getByLabel('Поиск людей').fill('Бо');

  await expect(fallback(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
  await expect(userMenuButton(page)).toBeVisible();

  const box = await fallback(page).boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);

  broken = false;
  await clickBehindOverlay(page.getByRole('button', { name: 'Повторить' }));

  await expect(fallback(page)).toHaveCount(0);
  await expect(page.getByLabel('Поиск людей')).toBeVisible();
});

test('[UC-UI-03] ошибка на корне: сообщение и «Перезагрузить страницу» вместо белого экрана', async ({ page }) => {
  await login(page);
  const session = await (await page.request.get('/api/auth/session')).json();
  // Шапка находится вне границ экранов, её сбой ловит корневая граница. Данные сессии проходят проверку формы,
  // поэтому ошибку вызывает маркерное слово имени: Array.from на нём бросает (только в этом тесте).
  await page.addInitScript(breakArrayFromOnVictim);
  const handler = (route) => route.fulfill({ json: { ...session, user: { ...session.user, name: 'Жертва Рендера' } } });
  await page.route('**/api/auth/session', handler);

  await page.reload();

  await expect(fallback(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Перезагрузить страницу' })).toBeVisible();

  await page.unroute('**/api/auth/session', handler);
  await clickBehindOverlay(page.getByRole('button', { name: 'Перезагрузить страницу' }));

  await expect(userMenuButton(page)).toBeVisible();
  await expect(fallback(page)).toHaveCount(0);
});
