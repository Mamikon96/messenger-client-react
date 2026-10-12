// Тесты hook-скриптов Claude Code (FE-52, FE-D27): сводка при старте сессии и проверка памяти перед остановкой. node --test scripts/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BRIEF = path.join(__dirname, 'session-brief.sh');
const STOP = path.join(__dirname, 'hooks', 'stop-memory-check.sh');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-'));

const TASKS = `# Задачи
> Проверено: 2026-10-13 @ abc1234

## В работе
- **FE-77 (P1)** Задача в работе
  - Осталось: шаг два

## Бэклог
- **FE-78 (P3)** Бэклог не печатается

## Сделано
- 2026-10-01 — история не печатается
`;
const STATE = `# Состояние
> Проверено: 2026-10-13 @ abc1234

## Общее
Общее не печатается

## Последняя приёмка
\`npm run accept\` → 0 · 2026-10-12

## Фокус сейчас
Фокус на FE-77
`;

test('сводка: «В работе», последняя приёмка и фокус — есть; бэклог и история — нет', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'tasks.md'), TASKS);
  fs.writeFileSync(path.join(dir, 'state.md'), STATE);
  const r = spawnSync('bash', [BRIEF, path.join(dir, 'tasks.md'), path.join(dir, 'state.md')], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /FE-77/);
  assert.match(r.stdout, /Осталось: шаг два/);
  assert.match(r.stdout, /npm run accept` → 0/);
  assert.match(r.stdout, /Фокус на FE-77/);
  assert.doesNotMatch(r.stdout, /FE-78|история не печатается|Общее не печатается/);
  assert.match(r.stdout, /Ветка:/);
});

test('сводка: нет файлов памяти — код 0 и пометка, старт сессии не ломается', () => {
  const r = spawnSync('bash', [BRIEF, '/nonexistent/tasks.md', '/nonexistent/state.md'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /нет файла/);
});

const stop = (stdin, check) =>
  spawnSync('bash', [STOP], { input: stdin, encoding: 'utf8', env: { ...process.env, STOP_HOOK_CHECK: check } });

test('stop: память в порядке — код 0', () => {
  assert.equal(stop('{"hook_event_name":"Stop","stop_hook_active":false}', 'true').status, 0);
});

test('stop: память устарела — код 2, вывод проверки и подсказка в stderr', () => {
  const r = stop('{"hook_event_name":"Stop","stop_hook_active":false}', 'echo "✗ src/x.js изменён позже tasks.md"; false');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /src\/x\.js изменён позже tasks\.md/);
  assert.match(r.stderr, /Почему:.*Как исправить:/s);
});

test('stop: повторная остановка после возврата (stop_hook_active) — код 0, без зацикливания', () => {
  assert.equal(stop('{"hook_event_name":"Stop","stop_hook_active": true}', 'false').status, 0);
});

test('stop: пустой или битый stdin — проверка всё равно выполняется', () => {
  assert.equal(stop('', 'false').status, 2);
  assert.equal(stop('not json', 'true').status, 0);
});
