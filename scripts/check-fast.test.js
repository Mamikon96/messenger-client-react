// Тесты выбора лёгких проверок цикла разработки (node --test scripts/). Пишутся до реализации scripts/check-fast.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const F = require('./check-fast.js');

const names = (plan) => plan.map((s) => s.name);
const step = (plan, name) => plan.find((s) => s.name === name);
const plan = (changed, contractCases = [], existing = []) =>
  F.planChecks({ changed, contractCases, exists: (p) => changed.includes(p) || existing.includes(p) });

test.describe('planChecks', () => {
  test('нет изменений и кейсов контракта — только проверка контракта задачи', () => {
    assert.deepEqual(names(plan([])), ['контракт']);
  });

  test('порядок: контракт → ESLint → unit → тесты scripts → e2e (от дешёвого к дорогому)', () => {
    const p = plan(['src/app/a.js', 'scripts/x.js', 'e2e/chats.spec.js'], ['UC-A-01'], ['scripts/x.test.js']);
    assert.deepEqual(names(p), ['контракт', 'ESLint', 'unit', 'тесты scripts', 'e2e: кейсы контракта', 'e2e: изменённые спеки']);
  });

  test('ESLint — только изменённые .js в src, e2e, scripts, mock-bff', () => {
    const p = plan(['src/app/a.js', 'src/app/a.css', 'docs/x.md', 'mock-bff/server.js', 'e2e/helpers/auth.js']);
    assert.deepEqual(step(p, 'ESLint').cmd, ['npx', 'eslint', '--max-warnings=0', 'src/app/a.js', 'mock-bff/server.js', 'e2e/helpers/auth.js']);
  });

  test('unit — Jest по связанным тестам изменённых .js в src, в режиме CI', () => {
    const s = step(plan(['src/app/a.js', 'src/app/a.test.js', 'src/app/a.css']), 'unit');
    assert.deepEqual(s.cmd, [
      'npx', 'react-scripts', 'test', '--watchAll=false', '--passWithNoTests', '--findRelatedTests',
      'src/app/a.js', 'src/app/a.test.js',
    ]);
    assert.equal(s.env.CI, 'true');
  });

  test('без изменённых .js в src (только стили, скрипты) — unit не запускается', () => {
    assert.equal(step(plan(['scripts/x.sh', 'src/app/a.css']), 'unit'), undefined);
  });

  test('тесты scripts: изменённый тест, тест изменённого скрипта, hooks и package.json', () => {
    const p = plan(
      ['scripts/check-state.js', 'scripts/qa-required.test.js', 'scripts/hooks/stop-memory-check.sh', 'package.json', 'scripts/accept.sh'],
      [],
      ['scripts/check-state.test.js', 'scripts/hooks.test.js', 'scripts/eslint-rules.test.js']
    );
    assert.deepEqual(step(p, 'тесты scripts').cmd, [
      'node', '--test', 'scripts/check-state.test.js', 'scripts/qa-required.test.js', 'scripts/hooks.test.js', 'scripts/eslint-rules.test.js',
    ]);
  });

  test('e2e по кейсам контракта — точный grep по тегам [UC-…]', () => {
    const s = step(plan([], ['UC-AUTH-06', 'UC-AUTH-07']), 'e2e: кейсы контракта');
    assert.deepEqual(s.cmd, ['npx', 'playwright', 'test', '-g', '\\[(UC-AUTH-06|UC-AUTH-07)\\]']);
    assert.equal(s.env.CI, 'true');
  });

  test('e2e: изменённые спеки целиком; удалённые не передаются', () => {
    const p = F.planChecks({ changed: ['e2e/chats.spec.js', 'e2e/gone.spec.js'], contractCases: [], exists: (f) => f !== 'e2e/gone.spec.js' });
    assert.deepEqual(step(p, 'e2e: изменённые спеки').cmd, ['npx', 'playwright', 'test', 'e2e/chats.spec.js']);
  });

  test('удалённые .js не попадают в ESLint и unit', () => {
    const p = F.planChecks({ changed: ['src/app/gone.js', 'scripts/gone.js', 'src/app/a.js'], contractCases: [], exists: (f) => !f.includes('gone') });
    assert.deepEqual(step(p, 'ESLint').cmd, ['npx', 'eslint', '--max-warnings=0', 'src/app/a.js']);
    assert.deepEqual(step(p, 'unit').cmd.slice(-1), ['src/app/a.js']);
  });

  test('изменился общий файл e2e (хелпер) — весь e2e вместо выборочного', () => {
    const p = plan(['e2e/helpers/auth.js', 'e2e/chats.spec.js'], ['UC-A-01']);
    assert.deepEqual(step(p, 'e2e: все (изменён общий файл e2e)').cmd, ['npx', 'playwright', 'test']);
    assert.equal(step(p, 'e2e: кейсы контракта'), undefined);
    assert.equal(step(p, 'e2e: изменённые спеки'), undefined);
  });

  test('изменился mock-BFF — его контрактные спеки', () => {
    const p = plan(['mock-bff/server.js'], [], ['e2e/mock-bff.contract.spec.js', 'e2e/mock-bff-proxy.spec.js']);
    assert.deepEqual(step(p, 'e2e: изменённые спеки').cmd, ['npx', 'playwright', 'test', 'e2e/mock-bff.contract.spec.js', 'e2e/mock-bff-proxy.spec.js']);
  });
});

test.describe('splitZ', () => {
  test('вывод git -z: пути с пробелами и не-ASCII без экранирования', () => {
    assert.deepEqual(F.splitZ('src/a b.js\0src/тема.js\0'), ['src/a b.js', 'src/тема.js']);
    assert.deepEqual(F.splitZ(''), []);
  });
});

test.describe('activeCaseIds', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const block = (id, status) => `### ${id} — Название\nСтатус: ${status}\nОписание: о.\nШаги: 1. ш.\nОжидается: о.\n`;

  test('active-кейсы берутся из всех файлов docs/user-cases/, planned пропускаются', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-fast-'));
    fs.mkdirSync(path.join(root, 'docs/user-cases'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'docs/user-cases.md'),
      '# Кейсы\n\n| ID | Название | Статус | Файл |\n|---|---|---|---|\n| UC-A-01 | Название | active | docs/user-cases/a.md |\n| UC-A-02 | Название | planned | docs/user-cases/a.md |\n| UC-B-01 | Название | active | docs/user-cases/b.md |\n'
    );
    fs.writeFileSync(path.join(root, 'docs/user-cases/a.md'), `## A\n\n${block('UC-A-01', 'active')}\n${block('UC-A-02', 'planned')}`);
    fs.writeFileSync(path.join(root, 'docs/user-cases/b.md'), `## B\n\n${block('UC-B-01', 'active')}`);
    assert.deepEqual([...F.activeCaseIds(root)].sort(), ['UC-A-01', 'UC-B-01']);
  });

  test('нет набора кейсов — пустое множество', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-fast-'));
    assert.equal(F.activeCaseIds(root).size, 0);
  });
});
