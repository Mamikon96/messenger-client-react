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
    if (content !== null) fs.writeFileSync(path.join(dir, name), content);
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
