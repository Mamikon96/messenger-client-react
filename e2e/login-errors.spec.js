const { test, expect } = require('@playwright/test');
const { MOCK_USER_LOGIN, MOCK_USER_PASSWORD, signInControl, submitCredentials, userMenuButton } = require('./helpers/auth');

// Форма осталась на экране: мессенджер не открылся.
const expectFormStays = (page) => expect(page.getByRole('tablist', { name: 'Вход или регистрация' })).toBeVisible();

// Логин уникален в пределах прогона: mock-BFF живёт весь прогон, а тесты идут параллельно.
const uniqueLogin = () => `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const LOGIN_API = '**/api/auth/login';
const UNAVAILABLE = 'Не удалось войти. Проверьте соединение и попробуйте снова.';

// Подменяет ответ сервера на время теста; тело ошибки — в формате docs/client-integration.md §1.3.
const fulfillError = (status, code, headers = {}) => (route) =>
  route.fulfill({
    status,
    headers,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code, message: 'текст сервера не показывается' } }),
  });

const openRegister = async (page) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Регистрация' }).click();
};

const submitRegistration = async (page, login, password) => {
  await page.getByLabel('Логин').fill(login);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
};

test('[UC-AUTH-14] неверный логин или пароль: одно общее сообщение, затем верные данные входят', async ({ page }) => {
  await page.goto('/');

  await submitCredentials(page, 'nobody-here', MOCK_USER_PASSWORD);
  await expect(page.getByText('Неверный логин или пароль')).toBeVisible();
  await expect(signInControl(page)).toBeVisible();

  await submitCredentials(page, MOCK_USER_LOGIN, 'wrong-password-1');
  await expect(page.getByText('Неверный логин или пароль')).toBeVisible();
  await expectFormStays(page);

  await submitCredentials(page, MOCK_USER_LOGIN, MOCK_USER_PASSWORD);
  await expect(userMenuButton(page)).toBeVisible();
  await expect(page.getByText('Неверный логин или пароль')).toHaveCount(0);
});

test('[UC-AUTH-15] логин занят: сообщение у поля логина, в том числе при другом регистре', async ({ page }) => {
  await openRegister(page);

  await submitRegistration(page, MOCK_USER_LOGIN.toUpperCase(), MOCK_USER_PASSWORD);

  await expect(page.getByLabel('Логин')).toHaveAccessibleDescription('Этот логин уже занят');
  await expect(page.getByLabel('Пароль')).not.toHaveAttribute('aria-invalid', 'true');
  await expectFormStays(page);
});

test('[UC-AUTH-17] слишком много попыток: время ожидания из Retry-After', async ({ page }) => {
  await page.route(LOGIN_API, fulfillError(429, 'rate_limited', { 'Retry-After': '42' }));
  await page.goto('/');

  await submitCredentials(page, MOCK_USER_LOGIN, MOCK_USER_PASSWORD);

  await expect(page.getByText('Слишком много попыток, повторите через 42 с')).toBeVisible();
  await expectFormStays(page);
});

test('[UC-AUTH-17] ожидание от минуты и больше показывается в минутах', async ({ page }) => {
  await page.route(LOGIN_API, fulfillError(429, 'rate_limited', { 'Retry-After': '900' }));
  await page.goto('/');

  await submitCredentials(page, MOCK_USER_LOGIN, MOCK_USER_PASSWORD);

  await expect(page.getByText('Слишком много попыток, повторите через 15 мин')).toBeVisible();
});

test('[UC-AUTH-17] 429 при регистрации: то же сообщение', async ({ page }) => {
  await page.route('**/api/auth/register', fulfillError(429, 'rate_limited', { 'Retry-After': '7' }));
  await openRegister(page);

  await submitRegistration(page, uniqueLogin(), MOCK_USER_PASSWORD);

  await expect(page.getByText('Слишком много попыток, повторите через 7 с')).toBeVisible();
});

test('[UC-AUTH-19] слишком распространённый пароль: сообщение у поля пароля, аккаунт не создаётся', async ({ page }) => {
  await openRegister(page);

  const newLogin = uniqueLogin();
  await submitRegistration(page, newLogin, 'password1234');

  await expect(page.getByLabel('Пароль')).toHaveAccessibleDescription('Этот пароль слишком распространён, придумайте другой');
  await expect(page.getByLabel('Логин')).not.toHaveAttribute('aria-invalid', 'true');
  await expectFormStays(page);

  // Аккаунт не создан: тот же логин с допустимым паролем регистрируется без «логин занят».
  await page.getByLabel('Пароль').fill(MOCK_USER_PASSWORD);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByLabel('Пароль')).toHaveCount(0);
});

test('ответ 400 с details: ошибки у полей по field и code, текст сервера не показывается', async ({ page }) => {
  await page.route('**/api/auth/register', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'validation_failed',
          message: 'не используется',
          details: [
            { field: 'login', code: 'invalid_format' },
            { field: 'password', code: 'too_short' },
          ],
        },
      }),
    }),
  );
  await openRegister(page);

  await submitRegistration(page, 'a b', 'short');

  await expect(page.getByLabel('Логин')).toHaveAccessibleDescription(/латинские буквы, цифры/);
  await expect(page.getByLabel('Пароль')).toHaveAccessibleDescription('Пароль не короче 12 символов');
  await expect(page.getByLabel('Логин')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('не используется')).toHaveCount(0);
});

for (const [name, handler] of [
  ['обрыв связи', (route) => route.abort('failed')],
  ['ответ 500', fulfillError(500, 'internal_error')],
  ['ответ 403 forbidden', fulfillError(403, 'forbidden')],
]) {
  test(`[UC-AUTH-20] сервер недоступен (${name}): сообщение, логин остаётся, повтор проходит`, async ({ page }) => {
    await page.route(LOGIN_API, handler);
    await page.goto('/');

    await submitCredentials(page, MOCK_USER_LOGIN, MOCK_USER_PASSWORD);

    await expect(page.getByText(UNAVAILABLE)).toBeVisible();
    await expect(page.getByLabel('Логин')).toHaveValue(MOCK_USER_LOGIN);

    await page.unroute(LOGIN_API);
    await signInControl(page).click();

    await expect(userMenuButton(page)).toBeVisible();
  });
}

test('[UC-AUTH-09] отключённый пользователь: с верным паролем — объяснение, с неверным — обычное сообщение', async ({ page }) => {
  await page.goto('/');

  await submitCredentials(page, 'disabled', MOCK_USER_PASSWORD);
  await expect(page.getByText('Ваш доступ отключён администратором')).toBeVisible();
  await expectFormStays(page);

  await submitCredentials(page, 'disabled', 'wrong-password-1');
  await expect(page.getByText('Неверный логин или пароль')).toBeVisible();
  await expect(page.getByText('Ваш доступ отключён администратором')).toHaveCount(0);
});
