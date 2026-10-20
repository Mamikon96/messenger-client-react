#!/usr/bin/env node
// Аудит расхода токенов по транскриптам Claude Code этого проекта (.ai/rules/token-audit.md).
// Запуск: node scripts/token-audit.js [--days N] [--dir <каталог транскриптов>]
// Считает cache read / cache write / output для основных сессий и субагентов, разбивку по типам агентов,
// самые дорогие сессии, размер первого хода, число tool-вызовов и перезаписи кэша посреди сессии.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REWRITE_MIN = 20000; // cache write больше этого на вызове при cache read меньше записи — кэш протух

const readJsonl = (file) => {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* битая строка */ }
  }
  return out;
};

// Транскрипт -> ответы ассистента без дублей (одно сообщение может писаться в несколько строк)
function assistantCalls(entries) {
  const seen = new Set();
  const calls = [];
  for (const e of entries) {
    const m = e.message;
    if (e.type !== 'assistant' || !m || !m.usage) continue;
    const key = m.id || e.uuid;
    if (seen.has(key)) continue;
    seen.add(key);
    const u = m.usage;
    const cr = u.cache_read_input_tokens || 0;
    const cc = u.cache_creation_input_tokens || 0;
    const input = u.input_tokens || 0;
    const tools = (m.content || []).filter((c) => c && c.type === 'tool_use');
    calls.push({ ts: e.timestamp, model: m.model, input, cr, cc, out: u.output_tokens || 0, ctx: input + cr + cc, tools });
  }
  return calls;
}

const sum = (calls, k) => calls.reduce((a, c) => a + c[k], 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// Условная стоимость во «входных токенах»: read ×0,1, write ×1,25, output ×5 (веса оценочные, для сравнения периодов)
const weighted = (t) => t.cr * 0.1 + t.cc * 1.25 + t.out * 5;

function collect(dir, sinceMs) {
  const sessions = [];
  const subs = [];
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!name.endsWith('.jsonl')) continue;
    const id = name.slice(0, -6);
    const calls = assistantCalls(readJsonl(path.join(dir, name))).filter((c) => !sinceMs || Date.parse(c.ts) >= sinceMs);
    if (calls.length) sessions.push({ id, calls });
    const subDir = path.join(dir, id, 'subagents');
    for (const sn of fs.existsSync(subDir) ? fs.readdirSync(subDir) : []) {
      if (!sn.endsWith('.jsonl')) continue;
      const sc = assistantCalls(readJsonl(path.join(subDir, sn))).filter((c) => !sinceMs || Date.parse(c.ts) >= sinceMs);
      if (!sc.length) continue;
      let type = '?';
      try { type = JSON.parse(fs.readFileSync(path.join(subDir, sn.replace(/\.jsonl$/, '.meta.json')), 'utf8')).agentType || '?'; } catch { /* нет meta */ }
      subs.push({ id: sn.slice(0, -6), type, calls: sc });
    }
  }
  return { sessions, subs };
}

const totals = (groups) => {
  const all = groups.flatMap((g) => g.calls);
  return { calls: all.length, cr: sum(all, 'cr'), cc: sum(all, 'cc'), out: sum(all, 'out') };
};

function rewrites(sessions) {
  const found = [];
  for (const s of sessions) {
    s.calls.forEach((c, i) => {
      if (i > 0 && c.cc > REWRITE_MIN && c.cr < c.cc) found.push({ id: s.id.slice(0, 8), cc: c.cc, gapMin: Math.round((Date.parse(c.ts) - Date.parse(s.calls[i - 1].ts)) / 60000) });
    });
  }
  return found.sort((a, b) => b.cc - a.cc);
}

function byAgentType(subs) {
  const map = new Map();
  for (const s of subs) {
    const r = map.get(s.type) || { runs: 0, calls: 0, cr: 0, cc: 0, firstSum: 0, maxSum: 0 };
    r.runs += 1; r.calls += s.calls.length; r.cr += sum(s.calls, 'cr'); r.cc += sum(s.calls, 'cc');
    r.firstSum += s.calls[0].ctx; r.maxSum += Math.max(...s.calls.map((c) => c.ctx));
    map.set(s.type, r);
  }
  return [...map.entries()].sort((a, b) => b[1].cr - a[1].cr);
}

function toolCounts(groups) {
  const m = new Map();
  for (const g of groups) for (const c of g.calls) for (const t of c.tools) m.set(t.name, (m.get(t.name) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const M = (n) => (n / 1e6).toFixed(1) + 'M';
const K = (n) => (n / 1e3).toFixed(1) + 'K';

function report({ sessions, subs }, label) {
  const lines = [];
  const main = totals(sessions);
  const sub = totals(subs);
  const wMain = weighted(main);
  const wSub = weighted(sub);
  lines.push(`# Аудит токенов: ${label}`, '');
  lines.push(`Сессий: ${sessions.length}, запусков субагентов: ${subs.length}`, '');
  lines.push('| | вызовов | cache read | cache write | output | взвешенно |', '|---|---|---|---|---|---|');
  lines.push(`| основные | ${main.calls} | ${M(main.cr)} | ${M(main.cc)} | ${M(main.out)} | ${M(wMain)} |`);
  lines.push(`| субагенты | ${sub.calls} | ${M(sub.cr)} | ${M(sub.cc)} | ${M(sub.out)} | ${M(wSub)} |`, '');
  lines.push('Взвешенно = read×0,1 + write×1,25 + output×5 (оценка, годится для сравнения периодов, не для счёта).', '');

  const firstMain = sessions.map((s) => s.calls[0].ctx);
  const firstSub = subs.map((s) => s.calls[0].ctx);
  const avgCtx = main.calls ? Math.round((main.cr + main.cc) / main.calls) : 0;
  lines.push('## Контекст', `- Первый ход основной сессии: медиана ${K(median(firstMain))} (фиксированный префикс, читается каждым вызовом)`);
  lines.push(`- Первый ход субагента: медиана ${K(median(firstSub))}`);
  lines.push(`- Средний контекст на вызов основной сессии: ${K(avgCtx)}; доля префикса: ${avgCtx ? Math.round((median(firstMain) / avgCtx) * 100) : 0}%`, '');

  lines.push('## Субагенты по типам', '| тип | запусков | вызовов | cache read | вызовов/запуск | первый ход | макс. контекст |', '|---|---|---|---|---|---|---|');
  for (const [t, r] of byAgentType(subs)) {
    lines.push(`| ${t} | ${r.runs} | ${r.calls} | ${M(r.cr)} | ${(r.calls / r.runs).toFixed(1)} | ${K(r.firstSum / r.runs)} | ${K(r.maxSum / r.runs)} |`);
  }
  lines.push('');

  lines.push('## Самые дорогие сессии (по cache read)', '| сессия | вызовов | cache read | средний контекст | модель |', '|---|---|---|---|---|');
  for (const s of [...sessions].sort((a, b) => sum(b.calls, 'cr') - sum(a.calls, 'cr')).slice(0, 5)) {
    const cr = sum(s.calls, 'cr');
    lines.push(`| ${s.id.slice(0, 8)} | ${s.calls.length} | ${M(cr)} | ${K(cr / s.calls.length)} | ${s.calls[0].model} |`);
  }
  lines.push('');

  const tools = toolCounts([...sessions, ...subs]);
  const totalTools = tools.reduce((a, [, n]) => a + n, 0);
  lines.push(`## Tool-вызовы (всего ${totalTools}; каждый — новый вызов API с чтением всего контекста)`);
  for (const [n, c] of tools.slice(0, 6)) lines.push(`- ${n}: ${c}`);
  lines.push('');

  const rw = rewrites(sessions);
  lines.push(`## Перезаписи кэша посреди сессии: ${rw.length} из ${main.calls} вызовов (${M(rw.reduce((a, r) => a + r.cc, 0))} токенов)`);
  for (const r of rw.slice(0, 3)) lines.push(`- ${r.id}: ${K(r.cc)} после паузы ${r.gapMin} мин`);
  return lines.join('\n') + '\n';
}

function main(argv) {
  const arg = (name, def) => { const i = argv.indexOf(name); return i === -1 ? def : argv[i + 1]; };
  const days = Number(arg('--days', 14));
  const dir = arg('--dir', path.join(os.homedir(), '.claude', 'projects', path.resolve(__dirname, '..').replace(/\//g, '-')));
  const sinceMs = days > 0 ? Date.now() - days * 86400000 : 0;
  const data = collect(dir, sinceMs);
  if (!data.sessions.length && !data.subs.length) {
    console.error(`Нет транскриптов за ${days} дн. в ${dir}`);
    process.exit(1);
  }
  process.stdout.write(report(data, days > 0 ? `последние ${days} дн.` : 'всё время'));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { assistantCalls, collect, report, rewrites, byAgentType, weighted };
