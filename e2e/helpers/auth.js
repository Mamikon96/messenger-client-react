const { expect } = require('@playwright/test');

// Единственное место, где e2e знают, как устроен вход и как зовут пользователя mock-BFF:
// при смене способа входа правится только этот модуль.
// Засеянный пользователь mock-BFF (mock-bff/server.js, SEED_USERS и SEED_PASSWORD).
const MOCK_USER_LOGIN = 'alice';
const MOCK_USER_PASSWORD = 'correct-horse-1';
const MOCK_USER_NAME = 'Alice Tester';

// Кнопка отправки формы входа (режим «Вход»).
const signInControl = (page) => page.getByRole('button', { name: 'Войти', exact: true });

// Кнопка пользователя в шапке мессенджера (открывает меню с «Выйти»).
const userMenuButton = (page) => page.getByRole('button', { name: MOCK_USER_NAME });

// Заполнить форму входа и отправить; экран входа уже открыт.
const submitCredentials = async (page, login, password) => {
  await page.getByLabel('Логин').fill(login);
  await page.getByLabel('Пароль').fill(password);
  await signInControl(page).click();
};

// Вход засеянным пользователем с уже открытого экрана входа (например, после выхода).
const signIn = async (page) => {
  await submitCredentials(page, MOCK_USER_LOGIN, MOCK_USER_PASSWORD);
};

// Открыть приложение и войти; возвращается, когда мессенджер показан.
const login = async (page) => {
  await page.goto('/');
  await signIn(page);
  await expect(userMenuButton(page)).toBeVisible();
};

module.exports = {
  MOCK_USER_LOGIN,
  MOCK_USER_PASSWORD,
  MOCK_USER_NAME,
  signInControl,
  userMenuButton,
  submitCredentials,
  signIn,
  login,
};
