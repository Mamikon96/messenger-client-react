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

// Hook контекста (FE-105, FE-D41): абсолютный порог по модели основной сессии (Sonnet/Haiku 90K, Opus и прочие 150K),
// замер по последнему ответу ассистента основной ветки (не isSidechain) в транскрипте
const GUARD = path.join(__dirname, 'hooks', 'context-guard.sh');
const OPUS = 'claude-opus-5-5';
const SONNET = 'claude-sonnet-5-5';

const usage = (total) => ({ input_tokens: 10, cache_read_input_tokens: total - 10 - 1000, cache_creation_input_tokens: 1000, output_tokens: 5 });
const entry = (model, total, extra = {}) => ({ type: 'assistant', message: { role: 'assistant', model, usage: usage(total) }, ...extra });

const guard = (entries, extra = {}) => {
  const dir = tmpDir();
  const file = path.join(dir, 't.jsonl');
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const input = JSON.stringify({ hook_event_name: 'Stop', transcript_path: file, ...extra });
  const r = spawnSync('bash', [GUARD], { input, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
};

test('context-guard: Sonnet, 90K — код 2, в сообщении модель, порог и tasks.md', () => {
  const r = guard([entry(SONNET, 90000)]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /sonnet/);
  assert.match(r.stderr, /90K/);
  assert.match(r.stderr, /tasks\.md/);
});

test('context-guard: Sonnet, 89K — код 0', () => {
  assert.equal(guard([entry(SONNET, 89000)]).status, 0);
});

test('context-guard: Opus, 100K — код 0; 150K — код 2 с порогом 150K', () => {
  assert.equal(guard([entry(OPUS, 100000)]).status, 0);
  const r = guard([entry(OPUS, 150000)]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /opus/);
  assert.match(r.stderr, /150K/);
});

test('context-guard: неизвестная модель — порог 150K', () => {
  assert.equal(guard([entry('claude-future-9', 100000)]).status, 0);
  assert.equal(guard([entry('claude-future-9', 150000)]).status, 2);
});

test('context-guard: берётся последний ответ основной ветки, а не сумма и не sidechain', () => {
  assert.equal(guard([entry(OPUS, 160000), entry(OPUS, 20000)]).status, 0);
  assert.equal(guard([entry(OPUS, 20000), entry(OPUS, 160000)]).status, 2);
  assert.equal(guard([entry(OPUS, 20000), entry(SONNET, 95000, { isSidechain: true })]).status, 0);
});

test('context-guard: stop_hook_active — код 0 при любом объёме', () => {
  assert.equal(guard([entry(SONNET, 300000)], { stop_hook_active: true }).status, 0);
  assert.equal(guard([entry(OPUS, 300000)], { stop_hook_active: true }).status, 0);
});

test('context-guard: нет транскрипта или битый stdin — код 0', () => {
  const r1 = spawnSync('bash', [GUARD], { input: '{"transcript_path":"/nonexistent/t.jsonl"}', encoding: 'utf8' });
  const r2 = spawnSync('bash', [GUARD], { input: 'not json', encoding: 'utf8' });
  assert.equal(r1.status, 0);
  assert.equal(r2.status, 0);
});

// Haiku — порог 90K, как у Sonnet (FE-D41 п. 4)
const HAIKU = 'claude-haiku-4-5';

test('context-guard: Haiku, 90K — код 2, 89K — код 0', () => {
  const r = guard([entry(HAIKU, 90000)]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /haiku/);
  assert.match(r.stderr, /90K/);
  assert.equal(guard([entry(HAIKU, 89000)]).status, 0);
});

// PostToolUse в субагенте: транскрипт <сессия>/subagents/agent-<agent_id>.jsonl, все записи isSidechain: true
const subagent = (entries, extra = {}, { explicitPath = false } = {}) => {
  const dir = tmpDir();
  const session = path.join(dir, 's.jsonl');
  fs.writeFileSync(session, '');
  // при explicitPath файла по запасному пути нет: транскрипт лежит в другом каталоге
  const subDir = explicitPath ? path.join(dir, 'elsewhere') : path.join(dir, 's', 'subagents');
  fs.mkdirSync(subDir, { recursive: true });
  const file = path.join(subDir, explicitPath ? 'custom.jsonl' : 'agent-A1.jsonl');
  fs.writeFileSync(file, entries.map((e) => JSON.stringify({ ...e, isSidechain: true })).join('\n') + '\n');
  const input = JSON.stringify({
    hook_event_name: 'PostToolUse',
    transcript_path: session,
    agent_id: 'A1',
    agent_type: 'react-engineer',
    ...(explicitPath ? { agent_transcript_path: file } : {}),
    ...extra,
  });
  const r = spawnSync('bash', [GUARD], { input, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
};

test('context-guard PostToolUse: субагент Sonnet, 90K — block-JSON в stdout, код 0; 89K — тишина', () => {
  const r = subagent([entry(SONNET, 90000)]);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /90000/);
  assert.match(out.reason, /sonnet/);
  assert.match(out.reason, /90K/);
  assert.match(out.reason, /tasks\.md/);
  const quiet = subagent([entry(SONNET, 89000)]);
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, '');
});

test('context-guard PostToolUse: субагент Opus — тишина при 100K, block при 150K', () => {
  assert.equal(subagent([entry(OPUS, 100000)]).stdout, '');
  assert.equal(JSON.parse(subagent([entry(OPUS, 150000)]).stdout).decision, 'block');
});

test('context-guard PostToolUse: путь из agent_transcript_path', () => {
  assert.equal(JSON.parse(subagent([entry(SONNET, 95000)], {}, { explicitPath: true }).stdout).decision, 'block');
});

test('context-guard PostToolUse: без agent_id — тишина при любом объёме', () => {
  const r = guard([entry(SONNET, 300000)], { hook_event_name: 'PostToolUse' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
});

test('context-guard PostToolUse: нет файла субагента или битый stdin — тишина, код 0', () => {
  const r1 = spawnSync('bash', [GUARD], { input: '{"hook_event_name":"PostToolUse","agent_id":"X","transcript_path":"/nonexistent/s.jsonl"}', encoding: 'utf8' });
  assert.equal(r1.status, 0);
  assert.equal(r1.stdout, '');
});

// Синтетические записи (model "<synthetic>", нулевой usage) не обнуляют замер
test('context-guard: последняя запись <synthetic> с нулями пропускается — Stop блокирует по предыдущему замеру', () => {
  const synthetic = { type: 'assistant', message: { role: 'assistant', model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } };
  assert.equal(guard([entry(SONNET, 95000), synthetic]).status, 2);
  const zeros = { type: 'assistant', message: { role: 'assistant', model: SONNET, usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } };
  assert.equal(guard([entry(SONNET, 95000), zeros]).status, 2);
});

test('context-guard PostToolUse: последняя запись <synthetic> с нулями пропускается — block-JSON', () => {
  const synthetic = { type: 'assistant', message: { role: 'assistant', model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } };
  assert.equal(JSON.parse(subagent([entry(SONNET, 95000), synthetic]).stdout).decision, 'block');
});

// Транскрипт читается с хвоста: файл больше окна, нужная запись в конце
test('context-guard: транскрипт больше окна хвоста — замер по записи в конце', () => {
  const filler = { type: 'user', message: { role: 'user', content: 'x'.repeat(100000) } };
  const many = Array.from({ length: 8 }, () => filler);
  assert.equal(guard([entry(OPUS, 160000), ...many, entry(OPUS, 20000)]).status, 0);
  assert.equal(guard([entry(OPUS, 20000), ...many, entry(OPUS, 160000)]).status, 2);
});

test('context-guard: в хвосте нет ответа ассистента — читается файл целиком', () => {
  const filler = { type: 'user', message: { role: 'user', content: 'x'.repeat(100000) } };
  const many = Array.from({ length: 8 }, () => filler);
  assert.equal(guard([entry(SONNET, 95000), ...many]).status, 2);
});
