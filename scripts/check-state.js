#!/usr/bin/env node
// Проверка состояния системы: рассинхрон между user-кейсами, API-контрактом, кодом и поведением (e2e).
// Источник истины — docs/user-cases.md (защищён хэшем .ai/user-cases.sha256, меняет его только scripts/approve-usecases.sh).
// Только встроенные модули Node. Логика — чистые функции (тесты: scripts/check-state.test.js), CLI — внизу файла.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CASES_FILE = 'docs/user-cases.md';
const LOCK_FILE = '.ai/user-cases.sha256';
const CONTRACT_FILE = 'docs/client-integration.md';
const MOCK_FILE = 'mock-bff/server.js';
const QA_REPORT = '.qa/report.md';
// Пути, изменение которых делает QA-отчёт устаревшим (код и тесты приложения, не память и не документы).
const CODE_PATHS = ['src', 'e2e', 'mock-bff', 'package.json', 'playwright.config.js'];

const METHODS = 'GET|POST|PUT|PATCH|DELETE';
const ID_RE = /^UC-[A-Z]+-\d{2,}$/;
const API_LINE_RE = new RegExp(`^(${METHODS}) (/\\S+)$`);
const STATUSES = ['active', 'planned'];

// ---------- кейсы ----------

function parseCases(md) {
  const cases = [];
  const errors = [];
  let cur = null;
  const seen = new Set();

  const finish = () => {
    if (!cur) return;
    const { id } = cur;
    if (!ID_RE.test(id)) errors.push(`${id}: ID не вида UC-ОБЛАСТЬ-NN`);
    if (seen.has(id)) errors.push(`${id}: повторяющийся ID`);
    seen.add(id);
    if (!STATUSES.includes(cur.status)) errors.push(`${id}: поле «Статус» должно быть active или planned (сейчас: ${cur.status || 'нет'})`);
    for (const [key, label] of [['description', 'Описание'], ['steps', 'Шаги'], ['expected', 'Ожидается']]) {
      if (!cur[key]) errors.push(`${id}: пустое или отсутствующее поле «${label}»`);
    }
    for (const a of cur.api) {
      if (!API_LINE_RE.test(a)) errors.push(`${id}: строка API «${a}» не вида «METHOD /path»`);
    }
    cases.push(cur);
    cur = null;
  };

  for (const line of md.split('\n')) {
    const head = line.match(/^### (UC-\S+) — (.*)$/);
    if (head) {
      finish();
      cur = { id: head[1], title: head[2].trim(), status: '', description: '', steps: '', expected: '', api: [] };
      continue;
    }
    if (/^#{1,2} /.test(line)) {
      finish();
      continue;
    }
    if (!cur) continue;
    const field = line.match(/^(Статус|Описание|Шаги|Ожидается|API):[ \t]*(.*)$/);
    if (!field) continue;
    const value = field[2].trim();
    if (field[1] === 'Статус') cur.status = value;
    else if (field[1] === 'Описание') cur.description = value;
    else if (field[1] === 'Шаги') cur.steps = value;
    else if (field[1] === 'Ожидается') cur.expected = value;
    else cur.api.push(value);
  }
  finish();

  if (cases.length === 0) errors.push('в документе кейсов нет ни одного кейса «### UC-… — …»');
  return { cases, errors };
}

const hashText = (text) => crypto.createHash('sha256').update(text).digest('hex');

function checkLock(text, lock) {
  if (lock === null || lock === undefined) {
    return [`${CASES_FILE} не утверждён: нет ${LOCK_FILE}. Утверждает пользователь: bash scripts/approve-usecases.sh`];
  }
  if (hashText(text) !== String(lock).trim()) {
    return [`${CASES_FILE} изменён без утверждения (хэш не совпадает с ${LOCK_FILE}). Менять кейсы можно только с разрешения пользователя; утверждает он сам: bash scripts/approve-usecases.sh`];
  }
  return [];
}

// ---------- e2e-тесты ----------

const TEST_DECL_RE = /\btest((?:\.\w+)*)\(\s*(["'`])((?:(?!\2).)*)\2/g;
const NON_TEST_MODS = new Set(['describe', 'step']);
const FORBIDDEN_MODS = new Set(['skip', 'fixme', 'only', 'fail']);

// Убирает комментарии // и /* */ (заменяет пробелами, переводы строк сохраняет); строки в кавычках не трогает.
// Регулярные литералы с кавычками не распознаются — в e2e-спеках они не ожидаются.
function stripComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function scanTests(files) {
  const tags = [];
  const errors = [];
  for (const [file, source] of Object.entries(files)) {
    const text = stripComments(source);
    const decls = [...text.matchAll(TEST_DECL_RE)].map((m) => ({
      mods: m[1] ? m[1].slice(1).split('.') : [],
      title: m[3],
      start: m.index,
    }));
    decls.forEach((d, i) => {
      for (const mod of d.mods) {
        if (FORBIDDEN_MODS.has(mod)) errors.push(`${file}: test.${mod} запрещён («${d.title}») — пропущенный тест не проверяет кейс`);
      }
      if (d.mods.some((m) => NON_TEST_MODS.has(m))) return;
      if (d.mods.length > 0) return; // test.skip/only и т. п. уже учтены
      const end = i + 1 < decls.length ? decls[i + 1].start : text.length;
      if (!/\bexpect\s*[(.]/.test(text.slice(d.start, end))) {
        errors.push(`${file}: тест «${d.title}» без expect — ничего не проверяет`);
      }
      for (const m of d.title.matchAll(/\[(UC-[A-Z]+-\d+)\]/g)) tags.push({ id: m[1], file, title: d.title });
    });
  }
  return { tags, errors };
}

function checkCoverage(cases, tags) {
  const errors = [];
  const byId = new Map(cases.map((c) => [c.id, c]));
  const tagged = new Set(tags.map((t) => t.id));
  for (const c of cases) {
    if (c.status === 'active' && !tagged.has(c.id)) errors.push(`${c.id}: active-кейс без e2e-теста с тегом [${c.id}]`);
  }
  for (const t of tags) {
    const c = byId.get(t.id);
    if (!c) errors.push(`${t.file}: тег [${t.id}] — такого кейса нет в ${CASES_FILE}`);
    else if (c.status === 'planned') {
      errors.push(`${t.file}: тест на кейс ${t.id} со статусом planned — перевести в active может только пользователь`);
    }
  }
  return errors;
}

// ---------- API ↔ код ----------

function normalizeEndpoint(method, rawPath) {
  const p = rawPath.split('?')[0].replace(/\/+$/, '');
  const segs = p.split('/').map((s) => (s.startsWith(':') || s.startsWith('{') || s.includes('${') ? ':p' : s));
  return `${method.toUpperCase()} ${segs.join('/')}`;
}

const pathOf = (endpoint) => endpoint.slice(endpoint.indexOf(' ') + 1);

function parseContract(md) {
  const set = new Set();
  const re = new RegExp(`\\b(${METHODS}) (/api/[^\\s\`)'"]*)`, 'g');
  for (const m of md.matchAll(re)) set.add(normalizeEndpoint(m[1], m[2].replace(/[.,;:]+$/, '')));
  return set;
}

function scanClientPaths(files) {
  const found = [];
  for (const [file, text] of Object.entries(files)) {
    for (const m of text.matchAll(/(["'`])(\/api\/[^"'`\s]*)\1/g)) {
      found.push({ path: pathOf(normalizeEndpoint('GET', m[2])), file });
    }
  }
  return found;
}

function scanMockRoutes(text) {
  const set = new Set();
  const re = new RegExp(`^\\s*//\\s*(${METHODS}) (/api/\\S+)`, 'gm');
  for (const m of text.matchAll(re)) set.add(normalizeEndpoint(m[1], m[2]));
  return set;
}

function checkApi({ contract, clientPaths, mockRoutes, cases }) {
  const errors = [];
  const contractPaths = new Set([...contract].map(pathOf));
  const reported = new Set();
  for (const c of clientPaths) {
    const key = `${c.file}|${c.path}`;
    if (!contractPaths.has(c.path) && !reported.has(key)) {
      reported.add(key);
      errors.push(`${c.file}: вызов ${c.path} отсутствует в API-контракте`);
    }
  }
  for (const r of mockRoutes) {
    if (!contract.has(r)) errors.push(`mock-BFF: маршрут ${r} отсутствует в API-контракте`);
  }
  for (const c of cases) {
    for (const a of c.api) {
      const m = a.match(API_LINE_RE);
      if (!m) continue; // формат ловит parseCases
      const ep = normalizeEndpoint(m[1], m[2]);
      if (!contract.has(ep)) errors.push(`${c.id}: API ${a} отсутствует в API-контракте`);
      else if (c.status === 'active' && !mockRoutes.has(ep)) errors.push(`${c.id}: API ${a} не реализован в mock-BFF (${MOCK_FILE})`);
    }
  }
  return errors;
}

// ---------- поведение (отчёт Playwright JSON) ----------

function collectSpecs(suites, out = []) {
  for (const s of suites || []) {
    for (const spec of s.specs || []) out.push(spec);
    collectSpecs(s.suites, out);
  }
  return out;
}

function behaviorMatrix(report, cases) {
  const specs = collectSpecs(report.suites);
  const rows = [];
  const errors = [];
  for (const c of cases.filter((x) => x.status === 'active')) {
    const mine = specs.filter((s) => s.title.includes(`[${c.id}]`));
    const failed = mine.filter((s) => {
      const tests = s.tests && s.tests.length ? s.tests : [{ status: s.ok ? 'expected' : 'unexpected' }];
      return tests.some((t) => t.status !== 'expected');
    });
    let state = 'pass';
    if (mine.length === 0) {
      state = 'missing';
      errors.push(`${c.id}: нет прогнанных e2e-тестов`);
    } else if (failed.length > 0) {
      state = 'fail';
      errors.push(`${c.id}: кейс нарушен — упало или пропущено ${failed.length} из ${mine.length} тестов`);
    }
    rows.push({ id: c.id, state, total: mine.length, failed: failed.length });
  }
  return { rows, errors };
}

function formatMatrix(rows) {
  const mark = { pass: '✓', fail: '✗', missing: '?' };
  return rows.map((r) => `  ${mark[r.state]} ${r.id}  ${r.state} (тестов: ${r.total}${r.failed ? `, упало: ${r.failed}` : ''})`).join('\n');
}


// ---------- отчёт агента qa-tester ----------

function checkQaReport(text, { casesHash, activeIds, treeHash }) {
  if (text === null || text === undefined) {
    return [`нет QA-отчёта ${QA_REPORT} — основная сессия запускает агента qa-tester (он проходит active-кейсы в браузере)`];
  }
  const errors = [];
  const header = (name) => (text.match(new RegExp(`^${name}:[ \\t]*(\\S+)`, 'm')) || [])[1];
  const tree = header('Дерево');
  const cases = header('Кейсы');
  const verdict = header('Вердикт');
  if (!tree) errors.push('QA-отчёт: нет строки «Дерево: <хэш>» (его печатает check-state.js --tree-hash)');
  if (!cases) errors.push('QA-отчёт: нет строки «Кейсы: <sha256>»');
  if (!verdict) errors.push('QA-отчёт: нет строки «Вердикт: PASS|FAIL»');
  if (!tree || !cases || !verdict) return errors;

  if (cases !== casesHash) errors.push('QA-отчёт устарел: документ кейсов изменился после прохода тестировщика');
  if (tree !== treeHash) errors.push('QA-отчёт устарел: код или тесты изменились после прохода тестировщика — запусти qa-tester заново');
  if (verdict !== 'PASS') errors.push(`QA-отчёт: Вердикт ${verdict} — проблемы нужно исправить и повторить проход`);

  const rows = new Map([...text.matchAll(/^\|\s*(UC-[A-Z]+-\d+)\s*\|\s*(\w+)\s*\|/gm)].map((m) => [m[1], m[2]]));
  for (const id of activeIds) {
    if (!rows.has(id)) errors.push(`QA-отчёт: кейс ${id} не пройден (нет в матрице)`);
    else if (rows.get(id) !== 'pass') errors.push(`QA-отчёт: кейс ${id} — ${rows.get(id)}`);
  }
  for (const m of text.matchAll(/^### (QA-\d+) \[(BLOCKER|MAJOR)\]\s*(.*)$/gm)) {
    errors.push(`QA-отчёт: открытая проблема ${m[1]} [${m[2]}] ${m[3]}`.trim());
  }
  return errors;
}

// Хэш содержимого кода и тестов приложения (git tree по CODE_PATHS, с неотслеживаемыми, без .gitignore) — не зависит от коммитов.
function codeTreeHash(root) {
  const { execFileSync } = require('node:child_process');
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'qa-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, 'index') };
  try {
    const paths = CODE_PATHS.filter((p) => fs.existsSync(path.join(root, p)));
    execFileSync('git', ['add', '-A', '--', ...paths], { cwd: root, env, stdio: 'pipe' });
    return execFileSync('git', ['write-tree'], { cwd: root, env, encoding: 'utf8' }).trim();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- CLI ----------

function walk(dir, filter, base = dir, out = {}) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, filter, base, out);
    else if (filter(e.name)) out[path.relative(base, full).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
  }
  return out;
}

const readIf = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);

function main(argv) {
  const args = { root: path.resolve(__dirname, '..'), requireContract: false, behaviorReport: null, requireQa: false, treeHash: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') args.root = path.resolve(argv[++i]);
    else if (argv[i] === '--require-contract') args.requireContract = true;
    else if (argv[i] === '--behavior-report') args.behaviorReport = path.resolve(argv[++i]);
    else if (argv[i] === '--require-qa') args.requireQa = true;
    else if (argv[i] === '--tree-hash') args.treeHash = true;
  }
  const at = (rel) => path.join(args.root, rel);
  if (args.treeHash) {
    console.log(codeTreeHash(args.root));
    return 0;
  }
  const errors = [];
  const warnings = [];

  console.log('==> Проверка состояния: кейсы ↔ API ↔ код ↔ поведение');

  const casesText = readIf(at(CASES_FILE));
  if (casesText === null) {
    console.log(`  ✗ нет ${CASES_FILE}`);
    return 1;
  }
  errors.push(...checkLock(casesText, readIf(at(LOCK_FILE))));
  const parsed = parseCases(casesText);
  errors.push(...parsed.errors);
  const { cases } = parsed;

  const isSpec = (n) => /\.spec\.js$/.test(n);
  const e2eFiles = Object.fromEntries(Object.entries(walk(at('e2e'), isSpec, args.root)));
  const scanned = scanTests(e2eFiles);
  errors.push(...scanned.errors, ...checkCoverage(cases, scanned.tags));

  const contractText = readIf(at(CONTRACT_FILE));
  if (contractText === null) {
    if (args.requireContract) errors.push(`нет ${CONTRACT_FILE} — сверка API↔код невозможна`);
    else warnings.push(`нет ${CONTRACT_FILE} (локальная копия, .gitignore) — сверка API↔код пропущена`);
  } else {
    const srcFiles = walk(at('src'), (n) => /\.jsx?$/.test(n) && !/\.(test|spec)\.jsx?$/.test(n) && n !== 'setupTests.js', args.root);
    errors.push(
      ...checkApi({
        contract: parseContract(contractText),
        clientPaths: scanClientPaths(srcFiles),
        mockRoutes: scanMockRoutes(readIf(at(MOCK_FILE)) || ''),
        cases,
      })
    );
  }

  if (args.behaviorReport) {
    let report;
    try {
      report = JSON.parse(fs.readFileSync(args.behaviorReport, 'utf8'));
    } catch (e) {
      errors.push(`не удалось прочитать отчёт e2e ${args.behaviorReport}: ${e.message}`);
    }
    if (report) {
      const { rows, errors: be } = behaviorMatrix(report, cases);
      console.log('  Поведение (кейс → e2e):');
      console.log(formatMatrix(rows));
      errors.push(...be);
    }
  }

  if (args.requireQa) {
    let treeHash = null;
    try {
      treeHash = codeTreeHash(args.root);
    } catch (e) {
      errors.push(`не удалось посчитать хэш дерева кода (нужен git-репозиторий): ${e.message.split('\n')[0]}`);
    }
    errors.push(
      ...checkQaReport(readIf(at(QA_REPORT)), {
        casesHash: hashText(casesText),
        activeIds: cases.filter((c) => c.status === 'active').map((c) => c.id),
        treeHash,
      })
    );
  }

  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  if (errors.length > 0) {
    console.log(`==> Состояние НЕ в порядке: ошибок ${errors.length}`);
    return 1;
  }
  const active = cases.filter((c) => c.status === 'active').length;
  console.log(`==> Состояние в порядке: active ${active}, planned ${cases.length - active}`);
  return 0;
}

module.exports = {
  parseCases,
  hashText,
  checkLock,
  scanTests,
  checkCoverage,
  normalizeEndpoint,
  parseContract,
  scanClientPaths,
  scanMockRoutes,
  checkApi,
  behaviorMatrix,
  formatMatrix,
  checkQaReport,
  codeTreeHash,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
