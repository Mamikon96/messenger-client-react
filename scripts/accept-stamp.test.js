// Тесты штампа приёмки (FE-52, FE-D27): штамп совпадает, пока не меняются проверяемые приёмкой файлы. node --test scripts/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'accept-stamp.sh');

// Временный git-репозиторий с файлами в проверяемых и непроверяемых каталогах
const repo = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  for (const f of ['src/a.js', 'e2e/a.spec.js', 'scripts/x.sh', '.ai/memory/tasks.md', 'package.json']) {
    fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), `${f}\n`);
  }
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  return dir;
};
const stamp = (dir, cmd) => spawnSync('bash', [SCRIPT, cmd], { encoding: 'utf8', env: { ...process.env, STAMP_ROOT: dir } });

test('write пишет .qa/accept.json с хэшем; check сразу после — совпадает (код 0)', () => {
  const dir = repo();
  assert.equal(stamp(dir, 'write').status, 0);
  const json = JSON.parse(fs.readFileSync(path.join(dir, '.qa/accept.json'), 'utf8'));
  assert.match(json.treeHash, /^[0-9a-f]{40}$/);
  assert.match(json.date, /^\d{4}-\d{2}-\d{2}/);
  assert.equal(stamp(dir, 'check').status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

for (const f of ['src/a.js', 'e2e/a.spec.js', 'scripts/x.sh', 'package.json']) {
  test(`изменение ${f} (в т. ч. незакоммиченное) — штамп устарел (код 1)`, () => {
    const dir = repo();
    stamp(dir, 'write');
    fs.appendFileSync(path.join(dir, f), 'изменение\n');
    const r = stamp(dir, 'check');
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /устарел/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('новый неотслеживаемый файл в src/ — штамп устарел', () => {
  const dir = repo();
  stamp(dir, 'write');
  fs.writeFileSync(path.join(dir, 'src/new.js'), 'x\n');
  assert.equal(stamp(dir, 'check').status, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('изменение памяти .ai/ — штамп остаётся действительным', () => {
  const dir = repo();
  stamp(dir, 'write');
  fs.appendFileSync(path.join(dir, '.ai/memory/tasks.md'), 'запись\n');
  assert.equal(stamp(dir, 'check').status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('нет штампа — код 1', () => {
  const dir = repo();
  const r = stamp(dir, 'check');
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /нет штампа/);
  fs.rmSync(dir, { recursive: true, force: true });
});
