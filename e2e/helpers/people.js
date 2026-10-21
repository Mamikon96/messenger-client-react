const { expect } = require('@playwright/test');
const { MOCK_USER_NAME, sessionUserId } = require('./auth');

// Люди, которых находит поиск. Запросы к /api/users и /api/chats* подменяются через page.route (см. mockPeopleServer).
const BOB = { id: 'u-bob', name: 'Боб Собеседник', avatarUrl: '' };
const CAROL = { id: 'u-carol', name: 'Кэрол Коллега', avatarUrl: '' };

const NOW = '2026-10-15T10:00:00.000Z';

// Простой сервер чатов в памяти страницы: поиск людей, список и карточки чатов, создание direct, сообщения.
// Подменяет /api/users и /api/chats*; вызывать до login(). Возвращает состояние, которым тест управляет:
// chats — список чатов, createStatus — статус ответа на создание (201 по умолчанию), createRequests — тела POST /api/chats,
// searches — значения q поиска, listDelayMs — задержка ответа на GET /api/chats (список снимается в момент ответа).
const mockPeopleServer = async (page, { people = [BOB, CAROL], chats = [] } = {}) => {
  const server = { chats, createStatus: null, createRequests: [], searches: [], listDelayMs: 0, messages: {} };
  // Id пользователя запрашивается один раз: запрос, пришедший при закрытии страницы, не должен читать уже закрытый ответ.
  let meIdPromise;
  const getMeId = () => (meIdPromise ||= sessionUserId(page));
  const dtoOf = async (chat) => {
    const meId = await getMeId();
    const peer = people.find(({ id }) => id === chat.peer.id);
    return {
      id: chat.id,
      type: 'direct',
      title: null,
      lastSeq: chat.lastSeq,
      members: [
        { userId: meId, name: MOCK_USER_NAME, avatarUrl: '', role: 'member' },
        { userId: peer.id, name: peer.name, avatarUrl: peer.avatarUrl, role: 'member' },
      ],
    };
  };

  await page.route(/\/api\/(users|chats)(\/|\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const parts = url.pathname.split('/').filter(Boolean); // ['api', 'chats', id?, 'messages'?]

    if (parts[1] === 'users') {
      const q = url.searchParams.get('q');
      server.searches.push(q);
      return route.fulfill({ json: people.filter(({ name }) => name.toLowerCase().includes(q.toLowerCase())) });
    }
    if (parts.length === 2 && method === 'GET') {
      const snapshot = [...server.chats];
      if (server.listDelayMs) await new Promise((resolve) => setTimeout(resolve, server.listDelayMs));
      return route.fulfill({ json: snapshot });
    }
    if (parts.length === 2 && method === 'POST') {
      const body = request.postDataJSON();
      server.createRequests.push(body);
      if (server.createStatus && server.createStatus !== 201) {
        return route.fulfill({ status: server.createStatus, json: { error: { code: 'not_found' } } });
      }
      const existing = server.chats.find(({ peer }) => peer.id === body.userId);
      if (existing) return route.fulfill({ status: 200, json: await dtoOf(existing) });
      const chat = { id: `d-${body.userId}`, type: 'direct', title: null, lastSeq: 0, lastMessage: null, unreadCount: 0, peer: people.find(({ id }) => id === body.userId) };
      server.chats.push(chat);
      return route.fulfill({ status: 201, json: await dtoOf(chat) });
    }
    const chat = server.chats.find(({ id }) => id === parts[2]);
    if (!chat) return route.fulfill({ status: 404, json: { error: { code: 'not_found' } } });
    if (parts.length === 3) return route.fulfill({ json: await dtoOf(chat) });

    const list = (server.messages[chat.id] ||= []);
    if (method === 'GET') return route.fulfill({ json: { messages: list, hasMore: false } });
    const { clientId, body } = request.postDataJSON();
    const message = { chatId: chat.id, seq: list.length + 1, senderId: await getMeId(), clientId, body, createdAt: NOW };
    list.push(message);
    chat.lastSeq = message.seq;
    chat.lastMessage = message;
    return route.fulfill({ status: 201, json: message });
  });
  return server;
};

const searchField = (page) => page.getByLabel('Поиск людей');

const writeButton = (page, name) => page.getByRole('button', { name: `Написать ${name}`, exact: true });

// Найти человека поиском и нажать «Написать»; возвращается, когда чат открыт.
const openDirectChat = async (page, person, query = person.name.slice(0, 3)) => {
  await searchField(page).fill(query);
  await writeButton(page, person.name).click();
  await expect(page.locator('.dialog__header-title')).toHaveText(person.name);
};

module.exports = { BOB, CAROL, mockPeopleServer, searchField, writeButton, openDirectChat };
