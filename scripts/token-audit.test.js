// Аудит токенов (scripts/token-audit.js): разбор транскрипта, дубли, субагенты, перезапись кэша. node --test scripts/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assistantCalls, collect, rewrites } = require('./token-audit');

const msg = (id, ts, u, tools = []) => JSON.stringify({
  type: 'assistant', timestamp: ts, uuid: id,
  message: { id, model: 'claude-sonnet-5-5', usage: { input_tokens: 1, cache_read_input_tokens: u.cr, cache_creation_input_tokens: u.cc, output_tokens: u.out }, content: tools.map((name) => ({ type: 'tool_use', name })) },
});

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-audit-'));
  fs.writeFileSync(path.join(dir, 's1.jsonl'), [
    msg('a', '2026-10-19T10:00:00Z', { cr: 0, cc: 30000, out: 100 }, ['Bash']),
    msg('a', '2026-10-19T10:00:00Z', { cr: 0, cc: 30000, out: 100 }), // дубль того же сообщения
    msg('b', '2026-10-19T10:01:00Z', { cr: 30000, cc: 500, out: 50 }, ['Read']),
    msg('c', '2026-10-19T12:00:00Z', { cr: 100, cc: 40000, out: 10 }), // кэш протух
  ].join('\n'));
  fs.mkdirSync(path.join(dir, 's1', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 's1', 'subagents', 'agent-x.jsonl'), msg('s', '2026-10-19T10:00:30Z', { cr: 5000, cc: 1000, out: 20 }));
  fs.writeFileSync(path.join(dir, 's1', 'subagents', 'agent-x.meta.json'), JSON.stringify({ agentType: 'qa-tester' }));
  return dir;
}

test('assistantCalls: дубли сообщений не считаются дважды', () => {
  const entries = fs.readFileSync(path.join(fixture(), 's1.jsonl'), 'utf8').split('\n').map((l) => JSON.parse(l));
  assert.equal(assistantCalls(entries).length, 3);
});

test('collect: сессии и субагенты с типом из meta', () => {
  const { sessions, subs } = collect(fixture(), 0);
  assert.equal(sessions.length, 1);
  assert.equal(subs[0].type, 'qa-tester');
});

test('rewrites: находит перезапись кэша после паузы', () => {
  const { sessions } = collect(fixture(), 0);
  const rw = rewrites(sessions);
  assert.equal(rw.length, 1);
  assert.equal(rw[0].gapMin, 119);
});

test('CLI печатает отчёт и падает без транскриптов', () => {
  const ok = spawnSync('node', [path.join(__dirname, 'token-audit.js'), '--days', '0', '--dir', fixture()], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /# Аудит токенов/);
  const empty = spawnSync('node', [path.join(__dirname, 'token-audit.js'), '--dir', fs.mkdtempSync(path.join(os.tmpdir(), 'ta-empty-'))], { encoding: 'utf8' });
  assert.equal(empty.status, 1);
});
