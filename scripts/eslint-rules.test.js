// Тесты архитектурных правил ESLint (FE-D25): правило срабатывает в своей зоне и молчит вне её. node --test scripts/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ESLint } = require('eslint');

const eslint = new ESLint({ cwd: path.join(__dirname, '..') });

// Сообщения только от архитектурных правил: прочие (no-unused-vars и т. п.) к проверке не относятся
const ARCH_RULES = ['no-restricted-imports', 'no-restricted-globals', 'no-restricted-properties', 'no-restricted-syntax'];
const archMessages = async (filePath, code) => {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => ARCH_RULES.includes(m.ruleId));
};

const expectViolation = async (filePath, code, ruleId) => {
  const messages = await archMessages(filePath, code);
  assert.equal(messages.length, 1, `${filePath}: ожидалось одно нарушение ${ruleId}, получено ${JSON.stringify(messages)}`);
  assert.equal(messages[0].ruleId, ruleId);
  assert.equal(messages[0].severity, 2, 'нарушение архитектуры — ошибка, а не предупреждение');
  assert.match(messages[0].message, /Почему:.*Как исправить:/s, 'сообщение объясняет причину и исправление');
};
const expectClean = async (filePath, code) => {
  assert.deepEqual(await archMessages(filePath, code), [], `${filePath}: не ожидалось нарушений`);
};

test('fetch в компоненте — ошибка', () =>
  expectViolation('src/app/modules/chat/Chat.js', 'export const load = () => fetch("/api/chats");\n', 'no-restricted-globals'));

test('window.fetch в слайсе — ошибка', () =>
  expectViolation('src/app/reducers/chats.js', 'export const load = () => window.fetch("/api/chats");\n', 'no-restricted-properties'));

test('fetch в services/ — разрешён', () =>
  expectClean('src/app/services/chatsApi.js', 'export const load = () => fetch("/api/chats");\n'));

test('fetch в тестах — разрешён (моки сети)', () =>
  expectClean('src/app/modules/chat/Chat.test.js', 'global.fetch = jest.fn();\nfetch("/api/chats");\n'));

test('services/ импортирует modules/ — ошибка', () =>
  expectViolation('src/app/services/chatsApi.js', 'import Chat from "../modules/chat/Chat";\nexport default Chat;\n', 'no-restricted-imports'));

test('reducers/ импортирует modules/ — ошибка', () =>
  expectViolation('src/app/reducers/chats.js', 'import { Button } from "../modules/ui/button/Button";\nexport default Button;\n', 'no-restricted-imports'));

test('слайс импортирует store — ошибка', () =>
  expectViolation('src/app/reducers/chats.js', 'import { store } from "../store";\nexport default store;\n', 'no-restricted-imports'));

test('reducers/ импортирует services/ — разрешено', () =>
  expectClean('src/app/reducers/auth.js', 'import { fetchSession } from "../services/authApi";\nexport default fetchSession;\n'));

test('modules/ импортирует reducers/ и modules/ — разрешено', () =>
  expectClean(
    'src/app/modules/chat/Chat.js',
    'import { selectChats } from "../../reducers/chats";\nimport { Button } from "../ui/button/Button";\nexport { selectChats, Button };\n',
  ));

test('console.log в коде src/ — ошибка', () =>
  expectViolation('src/app/modules/chat/Chat.js', 'export const f = (x) => { console.log(x); return x; };\n', 'no-restricted-syntax'));

test('console.log в тестах src/ — тоже ошибка', () =>
  expectViolation('src/app/modules/chat/Chat.test.js', 'test("x", () => { console.log(1); expect(1).toBe(1); });\n', 'no-restricted-syntax'));

test('console.error и console.warn — не ограничены', () =>
  expectClean('src/app/modules/chat/Chat.js', 'export const f = (e) => { console.error(e); console.warn(e); };\n'));
