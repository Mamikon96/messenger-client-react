// Тесты правила «нужен ли QA-проход для коммита» (FE-D29). node --test scripts/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'qa-required.sh');
const ROOT = path.join(__dirname, '..');
// Код 0 — QA нужен, 1 — не нужен
const required = (...files) => spawnSync('bash', [SCRIPT, ...files], { cwd: ROOT, encoding: 'utf8' }).status;

test('код приложения в src/ — QA нужен', () => {
  assert.equal(required('src/app/modules/chats/Chats.js'), 0);
});

test('mock-bff/ — QA нужен', () => {
  assert.equal(required('mock-bff/server.js'), 0);
});

test('CSS в src/ — QA нужен (меняет вид)', () => {
  assert.equal(required('src/app/modules/chats/Chats.css'), 0);
});

test('только unit-тесты и setupTests в src/ — QA не нужен', () => {
  assert.equal(required('src/app/modules/login/Login.test.js', 'src/setupTests.js'), 1);
});

test('тесты вместе с кодом — QA нужен', () => {
  assert.equal(required('src/app/modules/login/Login.test.js', 'src/app/modules/login/Login.js'), 0);
});

test('файлы вне src/ и mock-bff/ — QA не нужен', () => {
  assert.equal(required('package.json', 'scripts/accept.sh', '.ai/memory/tasks.md', 'e2e/login.spec.js'), 1);
});

test('пути нормализуются: ./src, абсолютный, a/../src', () => {
  assert.equal(required('./src/App.js'), 0);
  assert.equal(required(path.join(ROOT, 'src/App.js')), 0);
  assert.equal(required('scripts/../src/App.js'), 0);
  assert.equal(required('./src/App.test.js'), 1);
});

test('test-файл в mock-bff/ — QA не нужен', () => {
  assert.equal(required('mock-bff/server.test.js'), 1);
});

test('пустой путь вместе с кодом в src/ — QA нужен (гейт не открывается из-за сбоя нормализации)', () => {
  assert.equal(required('', 'src/App.js'), 0);
});
