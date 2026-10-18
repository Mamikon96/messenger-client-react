// Тесты проверки чистоты дерева в `git-task.sh start` (FE-133). node --test scripts/git-task.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'git-task.sh');

// Временный репозиторий с копией скрипта и заглушкой check-memory.sh; задача FE-99 в «Бэклоге»
const makeRepo = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-task-'));
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.mkdirSync(path.join(dir, '.ai/memory'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(dir, 'scripts/git-task.sh'));
  fs.writeFileSync(path.join(dir, 'scripts/check-memory.sh'), 'exit 0\n');
  fs.writeFileSync(path.join(dir, '.ai/memory/tasks.md'), '# Задачи\n\n## В работе\n\n## Бэклог\n- **FE-99 (P3)** задача\n');
  fs.writeFileSync(path.join(dir, '.ai/memory/queue.md'), '# Очередь\n- **FE-98 (P3)** задача\n');
  git('init', '-q', '-b', 'develop');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  const start = () =>
    spawnSync('bash', ['scripts/git-task.sh', 'start', 'FE-99', 'demo'], { cwd: dir, encoding: 'utf8' });
  const branch = () => git('branch', '--show-current').stdout.trim();
  return { dir, start, branch, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

test('start: изменённый queue.md не считается грязью дерева', () => {
  const r = makeRepo();
  try {
    fs.appendFileSync(path.join(r.dir, '.ai/memory/queue.md'), '- **FE-97 (P3)** ещё\n');
    const res = r.start();
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.equal(r.branch(), 'feature/FE-99-demo');
  } finally {
    r.cleanup();
  }
});

test('start: изменённый tasks.md по-прежнему не считается грязью', () => {
  const r = makeRepo();
  try {
    fs.appendFileSync(path.join(r.dir, '.ai/memory/tasks.md'), '- **FE-96 (P3)** ещё\n');
    const res = r.start();
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.equal(r.branch(), 'feature/FE-99-demo');
  } finally {
    r.cleanup();
  }
});

test('start: чужой изменённый файл — отказ, ветка не меняется', () => {
  const r = makeRepo();
  try {
    fs.appendFileSync(path.join(r.dir, '.ai/memory/queue.md'), '- **FE-97 (P3)** ещё\n');
    fs.writeFileSync(path.join(r.dir, 'other.txt'), 'x\n');
    const res = r.start();
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /незакоммиченные изменения/);
    assert.doesNotMatch(res.stderr, /queue\.md/);
    assert.equal(r.branch(), 'develop');
  } finally {
    r.cleanup();
  }
});
