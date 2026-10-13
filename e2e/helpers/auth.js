const { expect } = require('@playwright/test');

// Единственное место, где e2e знают, как устроен вход и как зовут пользователя mock-BFF:
// при смене способа входа (FE-60) правится только этот модуль.
const MOCK_USER_NAME = 'Mock google user';

// Элемент экрана входа, запускающий вход.
const signInControl = (page) => page.getByRole('link', { name: 'Войти через Google' });

// Кнопка пользователя в шапке мессенджера (открывает меню с «Выйти»).
const userMenuButton = (page) => page.getByRole('button', { name: MOCK_USER_NAME });

// Вход с уже открытого экрана входа (например, после выхода).
const signIn = async (page) => {
  await signInControl(page).click();
};

// Открыть приложение и войти; возвращается, когда мессенджер показан.
const login = async (page) => {
  await page.goto('/');
  await signIn(page);
  await expect(userMenuButton(page)).toBeVisible();
};

module.exports = { MOCK_USER_NAME, signInControl, userMenuButton, signIn, login };
