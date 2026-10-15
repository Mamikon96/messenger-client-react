const { test, expect } = require('@playwright/test');
const { MOCK_USER_LOGIN, MOCK_USER_PASSWORD, signInControl, userMenuButton } = require('./helpers/auth');

const REGISTER_API = '**/api/auth/register';
const LOGIN_API = '**/api/auth/login';
const FORMAT_HINT = 'Логин: от 3 до 32 знаков — латинские буквы, цифры, точка, дефис и подчёркивание';

const openRegister = async (page) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Регистрация' }).click();
};

const fillCredentials = async (page, login, password) => {
  await page.getByLabel('Логин').fill(login);
  await page.getByLabel('Пароль').fill(password);
};

// Считает запросы к эндпоинту и пропускает их дальше к mock-BFF.
const countRequests = (page, url) => {
  const counter = { count: 0 };
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes(url)) counter.count += 1;
  });
  return counter;
};

test('[UC-AUTH-16] регистрация: неверный логин и короткий пароль — подсказки у полей, запроса register нет', async ({ page }) => {
  const registerRequests = countRequests(page, '/api/auth/register');
  await openRegister(page);
  const submit = page.getByRole('button', { name: 'Зарегистрироваться' });

  await fillCredentials(page, 'ab', 'correct-horse-1');
  await submit.click();
  await expect(page.getByLabel('Логин')).toHaveAccessibleDescription(FORMAT_HINT);

  await fillCredentials(page, 'логин', 'correct-horse-1');
  await submit.click();
  await expect(page.getByLabel('Логин')).toHaveAccessibleDescription(FORMAT_HINT);

  await fillCredentials(page, 'free-login-92', 'a'.repeat(11));
  await submit.click();
  await expect(page.getByLabel('Пароль')).toHaveAccessibleDescription('Пароль не короче 12 символов');

  expect(registerRequests.count).toBe(0);
});

test('[UC-AUTH-16] вход: пустое поле — подсказка у поля, запроса login нет', async ({ page }) => {
  const loginRequests = countRequests(page, '/api/auth/login');
  await page.goto('/');

  await fillCredentials(page, MOCK_USER_LOGIN, '');
  await signInControl(page).click();
  await expect(page.getByLabel('Пароль')).toHaveAccessibleDescription('Введите пароль');

  await fillCredentials(page, '', MOCK_USER_PASSWORD);
  await signInControl(page).click();
  await expect(page.getByLabel('Логин')).toHaveAccessibleDescription('Введите логин');

  expect(loginRequests.count).toBe(0);
});

test('[UC-AUTH-18] двойное нажатие и Enter до ответа шлют один запрос, кнопка занята', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const loginRequests = countRequests(page, '/api/auth/login');
  await page.route(LOGIN_API, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await fillCredentials(page, MOCK_USER_LOGIN, MOCK_USER_PASSWORD);

  await signInControl(page).click();
  await expect(signInControl(page)).toBeDisabled();
  await expect(signInControl(page)).toHaveAttribute('aria-busy', 'true');
  await signInControl(page).click({ force: true });
  await page.getByLabel('Пароль').press('Enter');
  release();

  await expect(userMenuButton(page)).toBeVisible();
  expect(loginRequests.count).toBe(1);
});

test('[UC-AUTH-18] пока запрос идёт, вкладки заблокированы и ответ не показывает ошибку чужого режима', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(REGISTER_API, async (route) => {
    await gate;
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'login_taken', message: 'занят' } }),
    });
  });
  await openRegister(page);
  await fillCredentials(page, 'taken-login', 'correct-horse-1');
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();

  await expect(page.getByRole('tab', { name: 'Вход' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Вход' }).click({ force: true });
  await expect(page.getByRole('tab', { name: 'Регистрация' })).toHaveAttribute('aria-selected', 'true');
  release();

  await expect(page.getByLabel('Логин')).toHaveAccessibleDescription('Этот логин уже занят');
  await expect(page.getByRole('tab', { name: 'Регистрация' })).toHaveAttribute('aria-selected', 'true');
});

// Кнопка на время запроса отключается и роняет фокус на body: после ошибки фокус возвращается (чтобы не терять место на странице).
const fulfillJson = (status, body) => (route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test('[UC-AUTH-18] после общей ошибки сервера фокус возвращается на кнопку отправки', async ({ page }) => {
  await page.route(LOGIN_API, fulfillJson(401, { error: { code: 'auth_failed', message: 'x' } }));
  await page.goto('/');
  await fillCredentials(page, MOCK_USER_LOGIN, 'wrong-password-1');

  await signInControl(page).click();

  await expect(page.getByText('Неверный логин или пароль')).toBeVisible();
  await expect(signInControl(page)).toBeFocused();
});

test('[UC-AUTH-18] после ошибки поля от сервера фокус на первом поле с ошибкой', async ({ page }) => {
  await page.route(REGISTER_API, fulfillJson(409, { error: { code: 'login_taken', message: 'x' } }));
  await openRegister(page);
  await fillCredentials(page, 'taken-login', 'correct-horse-1');

  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();

  await expect(page.getByLabel('Логин')).toHaveAccessibleDescription('Этот логин уже занят');
  await expect(page.getByLabel('Логин')).toBeFocused();
});

test('[UC-AUTH-16] после ошибки проверки полей фокус на первом неверном поле', async ({ page }) => {
  await openRegister(page);
  await fillCredentials(page, 'ab', 'short');

  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();

  await expect(page.getByLabel('Логин')).toBeFocused();

  await fillCredentials(page, 'abc', 'short');
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();

  await expect(page.getByLabel('Пароль')).toBeFocused();
});
