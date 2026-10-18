// Тесты scripts/check-memory.sh в части архива «Сделано» (FE-52, FE-D27). Каталог памяти подменяется через MEM_DIR.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(__dirname, 'check-memory.sh');
const SHA = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const STAMP = `> Проверено: 2026-10-13 @ ${SHA}`;

const TASKS = `# Задачи\n${STAMP}\n\n## В работе\n—\n\n## Бэклог\n- **FE-90 (P3)** задача\n`;
const DONE = `# Сделано (архив)\n\n## Сделано\n- 2026-10-01 — FE-89: закрыта\n`;

// Папка decisions/ (FE-130): decisions.md — роутер (строка таблицы на каждое решение), тексты решений в decisions/*.md
const D_ROUTER = (rows) => `# Решения\n\n| ID | Название | Статус | Файл |\n|---|---|---|---|\n${rows}`;
const D_ROW = '| FE-D01 | Redux | действует | `decisions/state.md` |\n';
const D_FILE = '# Состояние\n\n## FE-D01 — Redux (2026-10-04)\n- **Решение:** x\n';

const run = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'));
  const all = {
    'README.md': '# Память\n',
    'decisions.md': '# Решения\n',
    'state.md': `# Состояние\n${STAMP}\n`,
    'architecture.md': `# Архитектура\n${STAMP}\n`,
    'tasks.md': TASKS,
    'done.md': DONE,
    ...files,
  };
  for (const [name, content] of Object.entries(all)) {
    if (content === null) continue;
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  const r = spawnSync('bash', [SCRIPT], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MEM_DIR: dir } });
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr };
};

test('корректные tasks.md и архив done.md — код 0', () => {
  const r = run({});
  assert.equal(r.code, 0, r.out);
});

test('раздел «Сделано» в tasks.md — ошибка: история живёт в done.md', () => {
  const r = run({ 'tasks.md': `${TASKS}\n## Сделано\n- 2026-10-01 — старое\n` });
  assert.equal(r.code, 1);
  assert.match(r.out, /done\.md/);
});

test('нет done.md — ошибка', () => {
  const r = run({ 'done.md': null });
  assert.equal(r.code, 1);
  assert.match(r.out, /done\.md/);
});

test('запись в done.md без даты — ошибка', () => {
  const r = run({ 'done.md': `# Сделано (архив)\n\n## Сделано\n- FE-89 без даты\n` });
  assert.equal(r.code, 1);
  assert.match(r.out, /без даты/);
});

test('в done.md нет раздела «## Сделано» — ошибка', () => {
  const r = run({ 'done.md': '# Сделано (архив)\n- 2026-10-01 — запись\n' });
  assert.equal(r.code, 1);
});

const LONG = 'x'.repeat(201);

test('строка бэклога длиннее 200 символов — ошибка', () => {
  const r = run({ 'tasks.md': `${TASKS}- **FE-91 (P3)** ${LONG}\n` });
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-91.*200|200.*FE-91/);
});

test('строка бэклога ровно 200 символов — код 0', () => {
  const head = '- **FE-91 (P3)** ';
  const r = run({ 'tasks.md': `${TASKS}${head}${'x'.repeat(200 - head.length)}\n` });
  assert.equal(r.code, 0, r.out);
});

test('длинная строка в «В работе» — не ошибка: ограничение только у бэклога', () => {
  const wip = `# Задачи\n${STAMP}\n\n## В работе\n—\n\n## Бэклог\n- **FE-90 (P3)** задача\n`;
  const r = run({ 'tasks.md': wip });
  assert.equal(r.code, 0, r.out);
});

const withBacklog = (files, extra = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'));
  fs.mkdirSync(path.join(dir, 'backlog'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'backlog', name), content);
  const all = {
    'README.md': '# Память\n', 'decisions.md': '# Решения\n', 'state.md': `# Состояние\n${STAMP}\n`,
    'architecture.md': `# Архитектура\n${STAMP}\n`, 'tasks.md': TASKS, 'done.md': DONE, ...extra,
  };
  for (const [name, content] of Object.entries(all)) fs.writeFileSync(path.join(dir, name), content);
  const r = spawnSync('bash', [SCRIPT], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MEM_DIR: dir } });
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr };
};

test('backlog/FE-NN.md со строкой в бэклоге — код 0', () => {
  const r = withBacklog({ 'FE-90.md': '# FE-90\nПодробности\n' });
  assert.equal(r.code, 0, r.out);
});

test('backlog/FE-NN.md без строки в бэклоге — ошибка', () => {
  const r = withBacklog({ 'FE-99.md': '# FE-99\n' });
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-99/);
});

test('backlog/ с файлом неверного имени — ошибка', () => {
  const r = withBacklog({ 'notes.md': 'x\n' });
  assert.equal(r.code, 1);
  assert.match(r.out, /notes\.md/);
});

test('ID решения повторяется в decisions.md и decisions-archive.md — ошибка', () => {
  const r = run({ 'decisions.md': D_ROUTER(D_ROW), 'decisions/state.md': D_FILE, 'decisions-archive.md': '# Архив\n\n## FE-D01 — a (ЗАМЕНЕНО)\n' });
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-D01/);
});

test('разные ID в decisions.md и decisions-archive.md — код 0', () => {
  const r = run({ 'decisions.md': D_ROUTER(D_ROW), 'decisions/state.md': D_FILE, 'decisions-archive.md': '# Архив\n\n## FE-D05 — a (ЗАМЕНЕНО)\n' });
  assert.equal(r.code, 0, r.out);
});

// Папка architecture/ (FE-125): architecture.md — роутер, подробности по темам в architecture/*.md
const ROUTER = `# Архитектура\n${STAMP}\n\n- \`architecture/store.md\` — store\n`;
const SUB = `# Store\n${STAMP}\n`;

test('architecture/*.md со штампом и строкой в роутере — код 0', () => {
  const r = run({ 'architecture.md': ROUTER, 'architecture/store.md': SUB });
  assert.equal(r.code, 0, r.out);
});

test('файл architecture/ без штампа — ошибка', () => {
  const r = run({ 'architecture.md': ROUTER, 'architecture/store.md': '# Store\n' });
  assert.equal(r.code, 1);
  assert.match(r.out, /architecture\/store\.md.*штамп/);
});

test('файл architecture/ не упомянут в роутере — ошибка', () => {
  const r = run({ 'architecture/store.md': SUB });
  assert.equal(r.code, 1);
  assert.match(r.out, /store\.md.*architecture\.md|architecture\.md.*store\.md/);
});

// Папка decisions/ (FE-130): тесты ниже

test('decisions/*.md со строкой роутера на каждое решение — код 0', () => {
  const r = run({ 'decisions.md': D_ROUTER(D_ROW), 'decisions/state.md': D_FILE });
  assert.equal(r.code, 0, r.out);
});

test('решение из decisions/*.md без строки в роутере — ошибка', () => {
  const r = run({ 'decisions.md': D_ROUTER(''), 'decisions/state.md': D_FILE });
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-D01/);
});

test('строка роутера без решения в decisions/*.md — ошибка', () => {
  const r = run({ 'decisions.md': D_ROUTER(D_ROW + '| FE-D09 | Призрак | действует | `decisions/state.md` |\n'), 'decisions/state.md': D_FILE });
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-D09/);
});

test('строка роутера указывает на другой файл, чем лежит решение — ошибка', () => {
  const r = run({
    'decisions.md': D_ROUTER('| FE-D01 | Redux | действует | `decisions/other.md` |\n'),
    'decisions/state.md': D_FILE, 'decisions/other.md': '# Другое\n',
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-D01/);
});

test('файл decisions/*.md не упомянут в роутере — ошибка', () => {
  const r = run({ 'decisions.md': D_ROUTER(D_ROW), 'decisions/state.md': D_FILE, 'decisions/extra.md': '# Лишний\n' });
  assert.equal(r.code, 1);
  assert.match(r.out, /extra\.md/);
});

test('ID решения повторяется в двух файлах decisions/ — ошибка', () => {
  const r = run({
    'decisions.md': D_ROUTER(D_ROW), 'decisions/state.md': D_FILE,
    'decisions/other.md': '# Другое\n\n## FE-D01 — дубль\n',
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-D01/);
});

test('ID решения из decisions/ повторяется в архиве — ошибка', () => {
  const r = run({
    'decisions.md': D_ROUTER(D_ROW), 'decisions/state.md': D_FILE,
    'decisions-archive.md': '# Архив\n\n## FE-D01 — a (ЗАМЕНЕНО)\n',
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-D01/);
});

test('текст решения (заголовок ## ID) в роутере decisions.md — ошибка', () => {
  const r = run({ 'decisions.md': D_ROUTER(D_ROW) + '\n## FE-D07 — в роутере\n', 'decisions/state.md': D_FILE });
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-D07/);
});

test('две строки роутера на один ID — ошибка', () => {
  const r = run({ 'decisions.md': D_ROUTER(D_ROW + D_ROW), 'decisions/state.md': D_FILE });
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-D01/);
});

test('файл decisions/ упомянут только в прозе роутера, не в таблице — ошибка', () => {
  const r = run({ 'decisions.md': D_ROUTER(D_ROW) + '\nСм. `decisions/extra.md`.\n', 'decisions/state.md': D_FILE, 'decisions/extra.md': '# Лишний\n' });
  assert.equal(r.code, 1);
  assert.match(r.out, /extra\.md/);
});
