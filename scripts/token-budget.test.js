// Бюджет токенов харнесса (FE-141): то, что попадает в контекст первого хода каждой сессии, не должно разрастаться. node --test scripts/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('сводка SessionStart короче 6000 символов', () => {
  const out = spawnSync('bash', [path.join(__dirname, 'session-brief.sh')], { cwd: ROOT, encoding: 'utf8' }).stdout;
  assert.ok(out.length < 6000, `сводка ${out.length} символов`);
});

test('«Фокус сейчас» в state.md: не больше 5 строк и 800 символов', () => {
  const lines = read('.ai/memory/state.md').split('\n');
  const start = lines.indexOf('## Фокус сейчас');
  assert.notEqual(start, -1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).filter((l) => l.trim());
  assert.ok(body.length <= 5, `строк: ${body.length}`);
  assert.ok(body.join('\n').length <= 800, `символов: ${body.join('\n').length}`);
});

test('description агентов: до 350 символов и без перечисления инструментов', () => {
  const dir = path.join(ROOT, '.claude', 'agents');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/^description: (.*)$/m);
    assert.ok(m, `${f}: нет description`);
    assert.ok(m[1].length <= 350, `${f}: description ${m[1].length} символов`);
    assert.ok(!m[1].includes('mcp__'), `${f}: в description перечислены инструменты`);
  }
});

test('проектные настройки отключают неиспользуемые плагины', () => {
  const plugins = JSON.parse(read('.claude/settings.json')).enabledPlugins;
  assert.equal(plugins['chrome-devtools-mcp@claude-plugins-official'], false);
  assert.equal(plugins['context7@anthropic-plugin-directory'], false);
  assert.notEqual(plugins['playwright@anthropic-plugin-directory'], false, 'playwright нужен qa-tester (в проекте не отключать; ключа может не быть — включён глобально)');
});

test('git-flow.md — шпаргалка до 6000 байт', () => {
  const size = fs.statSync(path.join(ROOT, '.ai/rules/git-flow.md')).size;
  assert.ok(size <= 6000, `git-flow.md ${size} байт`);
});

test('code-style.md требует экономить вывод больших команд', () => {
  const text = read('.ai/rules/code-style.md');
  assert.match(text, /git diff --stat/);
  assert.match(text, /\| head|-m\b/);
});
