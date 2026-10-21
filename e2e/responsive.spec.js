const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');
const { BOB, mockPeopleServer } = require('./helpers/people');

const CHAT = { id: 'd-bob', type: 'direct', title: null, lastSeq: 0, lastMessage: null, unreadCount: 0, peer: BOB };

const openMessenger = async (page, viewport) => {
  await page.setViewportSize(viewport);
  await mockPeopleServer(page, { chats: [{ ...CHAT }] });
  await login(page);
};

const chatRow = (page) => page.locator('.chat', { hasText: BOB.name });
const backButton = (page) => page.getByRole('button', { name: 'Назад', exact: true });

test.describe('адаптивная раскладка', () => {
  test('[UC-UI-02] на узком экране виден только список, после выбора чата — только диалог, «Назад» возвращает к списку', async ({ page }) => {
    await openMessenger(page, { width: 375, height: 700 });

    await expect(chatRow(page)).toBeVisible();
    await expect(page.locator('.dialog')).toBeHidden();

    await chatRow(page).click();
    await expect(page.locator('.dialog__header-title')).toHaveText(BOB.name);
    await expect(page.locator('.chats')).toBeHidden();
    await expect(backButton(page)).toBeVisible();

    await backButton(page).click();
    await expect(chatRow(page)).toBeVisible();
    await expect(page.locator('.dialog')).toBeHidden();
  });

  test('[UC-UI-02] на узком экране длинное название чата не перекрыто кнопкой «Назад»', async ({ page }) => {
    const peer = { ...BOB, name: 'Очень длинное название собеседника '.repeat(4).trim() };
    await page.setViewportSize({ width: 375, height: 700 });
    await mockPeopleServer(page, { people: [peer], chats: [{ ...CHAT, peer }] });
    await login(page);

    await page.locator('.chat', { hasText: 'Очень длинное' }).click();
    await expect(page.locator('.dialog__header-title')).toHaveText(peer.name);
    const title = await page.locator('.dialog__header-title').boundingBox();
    const back = await backButton(page).boundingBox();

    const overlaps = title.x < back.x + back.width && back.x < title.x + title.width
      && title.y < back.y + back.height && back.y < title.y + title.height;
    expect(overlaps).toBe(false);
  });

  test('[UC-UI-02] на широком экране обе панели видны вместе, кнопки «Назад» нет', async ({ page }) => {
    await openMessenger(page, { width: 1280, height: 800 });

    await expect(page.locator('.chats')).toBeVisible();
    await expect(page.locator('.dialog')).toBeVisible();
    await expect(backButton(page)).toBeHidden();

    await chatRow(page).click();
    await expect(page.locator('.dialog__header-title')).toHaveText(BOB.name);
    await expect(page.locator('.chats')).toBeVisible();
    await expect(page.locator('.dialog')).toBeVisible();
    await expect(backButton(page)).toBeHidden();
  });
});
