#!/usr/bin/env node
// Проверка состояния системы: рассинхрон между user-кейсами, API-контрактом, кодом и поведением (e2e).
// Источник истины — набор user-кейсов: индекс docs/user-cases.md и файлы по областям docs/user-cases/*.md (FE-128).
// Набор защищён одним хэшем .ai/user-cases.sha256 (индекс + имена и содержимое всех файлов), меняет его только scripts/approve-usecases.sh.
// Только встроенные модули Node. Логика — чистые функции (тесты: scripts/check-state.test.js), CLI — внизу файла.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CASES_FILE = 'docs/user-cases.md'; // индекс
const CASES_DIR = 'docs/user-cases'; // файлы кейсов по областям
const CASES_SET = `набор user-кейсов (${CASES_FILE} и ${CASES_DIR}/*.md)`;
const LOCK_FILE = '.ai/user-cases.sha256';
const CONTRACT_FILE = 'docs/client-integration.md';
const MOCK_FILE = 'mock-bff/server.js';
const QA_RUNS_DIR = '.qa/runs';
const TASKS_FILE = '.ai/memory/tasks.md';
const DONE_DIR = '.ai/memory/done';
// Триггеры полного прохода QA (FE-D56): дифф задачи правит общую инфраструктуру, набор user-кейсов или зависимости,
// либо ветка release/*, hotfix/*. Путь с «/» на конце — каталог целиком.
const QA_TRIGGER_PATHS = [
  'src/app/store.js',
  'src/app/reducers/auth.js',
  'src/app/services/apiClient.js',
  'src/app/services/authApi.js',
  'src/app/services/wsService.js',
  'mock-bff/',
  CASES_FILE,
  `${CASES_DIR}/`,
  'package.json',
  'package-lock.json',
];
const QA_TRIGGER_BRANCH_RE = /^(release|hotfix)\//;
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

// Индекс: строки таблиц `| ID | Название | Статус | Файл |`
function parseIndex(md) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  for (const line of md.split('\n')) {
    if (!/^\|\s*UC-/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 4) {
      errors.push(`индекс: строка «${line.trim()}» не вида «| ID | Название | Статус | Файл |»`);
      continue;
    }
    const [id, title, status, file] = cells;
    if (!ID_RE.test(id)) errors.push(`индекс: ${id}: ID не вида UC-ОБЛАСТЬ-NN`);
    if (seen.has(id)) errors.push(`индекс: ${id}: повторяющийся ID`);
    seen.add(id);
    if (!STATUSES.includes(status)) errors.push(`индекс: ${id}: статус должен быть active или planned (сейчас: ${status})`);
    if (!file) errors.push(`индекс: ${id}: не указан файл`);
    rows.push({ id, title, status, file });
  }
  if (rows.length === 0) errors.push('индекс: нет ни одной строки кейса «| UC-… | … | … | … |»');
  return { rows, errors };
}

// Согласованность индекса и файлов. casesByFile: { путь файла: [кейсы] } для всех файлов docs/user-cases/
function checkIndex(rows, casesByFile) {
  const errors = [];
  const indexed = new Set(rows.map((r) => `${r.file}\u0000${r.id}`));
  const reportedMissing = new Set();
  for (const { id, title, status, file } of rows) {
    const cases = casesByFile[file];
    if (!cases) {
      if (!reportedMissing.has(file)) errors.push(`индекс: файл ${file} не найден среди файлов ${CASES_DIR}/ (кейс ${id})`);
      reportedMissing.add(file);
      continue;
    }
    const found = cases.find((c) => c.id === id);
    if (!found) errors.push(`${id}: указан в индексе в файле ${file}, но там такого кейса нет`);
    else if (found.status !== status) errors.push(`${id}: статус в индексе (${status}) не совпадает со статусом в ${file} (${found.status})`);
    else if (found.title !== title) errors.push(`${id}: название в индексе («${title}») не совпадает с заголовком в ${file} («${found.title}»)`);
  }
  const filesOf = {};
  for (const [file, cases] of Object.entries(casesByFile)) {
    for (const c of cases) {
      (filesOf[c.id] = filesOf[c.id] || []).push(file);
      if (!indexed.has(`${file}\u0000${c.id}`)) errors.push(`${c.id}: кейс из ${file} не указан в индексе ${CASES_FILE}`);
    }
  }
  for (const [id, files] of Object.entries(filesOf)) {
    if (files.length > 1) errors.push(`${id}: повторяющийся ID в файлах ${files.join(', ')}`);
  }
  const used = new Set(rows.map((r) => r.file));
  for (const file of Object.keys(casesByFile)) {
    if (!used.has(file)) errors.push(`${file}: файл не указан ни в одной строке индекса ${CASES_FILE}`);
  }
  return errors;
}

// Текст для хэша: индекс первым, затем файлы по алфавиту; в хэш входят и пути, и содержимое
function bundleText(files) {
  const rank = (f) => (f.path === CASES_FILE ? 0 : 1);
  const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return [...files]
    .sort((a, b) => rank(a) - rank(b) || byPath(a, b))
    .map((f) => `=== ${f.path} ${Buffer.byteLength(f.text)}\n${f.text}\n`)
    .join('');
}

// Все файлы набора: { text, files: [{ path, text }] } (индекс, если есть, первым)
function casesBundle(root) {
  const files = [];
  const index = readIf(path.join(root, CASES_FILE));
  if (index !== null) files.push({ path: CASES_FILE, text: index });
  const dir = path.join(root, CASES_DIR);
  if (fs.existsSync(dir)) {
    const names = fs.readdirSync(dir)
      .filter((n) => n.endsWith('.md') && fs.statSync(path.join(dir, n)).isFile())
      .sort();
    for (const name of names) {
      files.push({ path: `${CASES_DIR}/${name}`, text: fs.readFileSync(path.join(dir, name), 'utf8') });
    }
  }
  return { text: bundleText(files), files };
}

// Кейсы всех файлов областей + ошибки разбора и согласованности с индексом
function loadCaseSet(root) {
  const bundle = casesBundle(root);
  const index = bundle.files.find((f) => f.path === CASES_FILE);
  if (!index) return { cases: [], errors: [`нет ${CASES_FILE}`], bundle };
  const errors = [];
  const cases = [];
  const casesByFile = {};
  for (const f of bundle.files) {
    if (f.path === CASES_FILE) continue;
    const parsed = parseCases(f.text);
    errors.push(...parsed.errors.map((e) => `${f.path}: ${e}`));
    casesByFile[f.path] = parsed.cases;
    cases.push(...parsed.cases);
  }
  const parsedIndex = parseIndex(index.text);
  errors.push(...parsedIndex.errors, ...checkIndex(parsedIndex.rows, casesByFile));
  return { cases, errors, bundle };
}

function checkLock(text, lock) {
  if (lock === null || lock === undefined) {
    return [`${CASES_SET} не утверждён: нет ${LOCK_FILE}. Утверждает пользователь: bash scripts/approve-usecases.sh --yes`];
  }
  if (hashText(text) !== String(lock).trim()) {
    return [`${CASES_SET} изменён без утверждения (хэш не совпадает с ${LOCK_FILE}). Менять кейсы можно только с разрешения пользователя; утверждает он сам: bash scripts/approve-usecases.sh --yes`];
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
    if (!c) errors.push(`${t.file}: тег [${t.id}] — такого кейса нет в ${CASES_SET}`);
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

const UC_ANY_RE = /UC-[A-Z]+-\d+/g;
const uniq = (ids) => [...new Set(ids)];

// ID задачи из имени ветки (feature/FE-80-slug → FE-80); ветка без ID (chore/…) — null.
function taskIdFromBranch(branch) {
  const m = /(?:^|\/)([A-Z]+-\d+)(?:-|$)/.exec(branch || '');
  return m ? m[1] : null;
}

// Отчёт qa-tester — файл задачи ветки (FE-D36): feature/FE-81-x → .qa/runs/FE-81.md, chore/x → .qa/runs/chore-x.md.
// Имя report.md не годится: Claude Code запрещает субагенту записывать такой файл.
function qaReportPath(branch) {
  const name = taskIdFromBranch(branch) || (branch || 'no-branch').replace(/[^\w.-]+/g, '-');
  return `${QA_RUNS_DIR}/${name}.md`;
}

// Кейсы из поля «Кейсы» контрактов раздела «В работе» (.ai/rules/task-contract.md). ID перечисляются явно: диапазоны не раскрываются.
// С taskId — только блок этой задачи; задачи нет в разделе — null. Без taskId — все задачи раздела.
function contractCaseIds(tasksMd, taskId = null) {
  const section = (('\n' + (tasksMd || '')).split('\n## В работе')[1] || '').split(/\n## /)[0];
  let blocks = section.split(/\n(?=- \*\*)/);
  if (taskId) {
    blocks = blocks.filter((b) => new RegExp(`^- \\*\\*${taskId}\\b`).test(b.trim()));
    if (blocks.length === 0) return null;
  }
  const ids = [];
  for (const b of blocks) for (const m of b.matchAll(/^\s+- (?:\*\*)?Кейсы:(?:\*\*)?(.*)$/gm)) ids.push(...(m[1].match(UC_ANY_RE) || []));
  return uniq(ids);
}

// Файл архива закрытых задач для ID (FE-D52).
const doneFileOf = (taskId) => `${DONE_DIR}/${taskId}.md`;

// Поле «Кейсы: …» записи задачи в файле архива done/<ID>.md (FE-D52; до следующего « · » или конца строки): к моменту git-task.sh commit контракт из tasks.md уже удалён.
function doneCaseIds(doneMd, taskId) {
  const line = (doneMd || '').split('\n').find((l) => new RegExp(`^- \\d{4}-\\d{2}-\\d{2} — ${taskId}\\b(?!-)`).test(l));
  if (!line) return { found: false, ids: [], hasField: false };
  const field = /Кейсы:([^·]*)/.exec(line);
  return { found: true, ids: field ? uniq(field[1].match(UC_ANY_RE) || []) : [], hasField: Boolean(field) };
}

// Кейсы контракта задачи ветки: «В работе», а после закрытия — запись в done/<ID>.md (FE-D35, FE-D52); doneMd — текст этого файла или null.
function taskCaseIds({ tasksMd, doneMd, taskId }) {
  if (!taskId) return { ids: contractCaseIds(tasksMd), errors: [] };
  const wip = contractCaseIds(tasksMd, taskId);
  if (wip) return { ids: wip, errors: [] };
  const done = doneCaseIds(doneMd, taskId);
  if (!done.found) return { ids: [], errors: [`задача ${taskId} (из имени ветки) не найдена ни в «В работе» ${TASKS_FILE}, ни в ${doneFileOf(taskId)}`] };
  if (!done.hasField) {
    return { ids: [], errors: [`в записи ${taskId} в ${doneFileOf(taskId)} нет поля «Кейсы: … | нет» — без него объём QA не восстановить (memory-protocol.md)`] };
  }
  return { ids: done.ids, errors: [] };
}

// Причины полного прохода QA (FE-D56): пути диффа задачи и имя ветки. Пустой массив — триггеров нет.
function qaTriggers({ paths, branch }) {
  const reasons = uniq(paths)
    .filter((p) => QA_TRIGGER_PATHS.some((t) => (t.endsWith('/') ? p.startsWith(t) : p === t)))
    .map((p) => `изменён ${p}`);
  if (QA_TRIGGER_BRANCH_RE.test(branch || '')) reasons.push(`ветка ${branch}`);
  return reasons;
}

// Обязательный объём прохода qa-tester (FE-D35, FE-D56): active-кейсы контракта; при full (триггер или --full) — все active-кейсы.
// Кейсы контракта не из active (удаляемые, planned) не требуются.
function qaScope({ contractIds, activeIds, full = false }) {
  return { ids: full ? uniq(activeIds) : uniq(contractIds.filter((id) => activeIds.includes(id))), errors: [] };
}

// taggedIds — кейсы с e2e-тестом с тегом [UC-…]: только им разрешена отметка `pass (e2e)` (FE-D48).
function checkQaReport(text, { casesHash, activeIds, requiredIds, treeHash, taggedIds = [], reportPath = `${QA_RUNS_DIR}/<задача>.md` }) {
  if (text === null || text === undefined) {
    return [`нет QA-отчёта ${reportPath} — основная сессия запускает агента qa-tester (он проходит в браузере объём --qa-scope)`];
  }
  const errors = [];
  const header = (name) => (text.match(new RegExp(`^${name}:[ \\t]*(\\S+)`, 'm')) || [])[1];
  const tree = header('Дерево');
  const cases = header('Кейсы');
  const verdict = header('Вердикт');
  const scopeLine = (text.match(/^Объём:[ \t]*(.*)$/m) || [])[1];
  if (!tree) errors.push('QA-отчёт: нет строки «Дерево: <хэш>» (его печатает check-state.js --tree-hash)');
  if (!cases) errors.push('QA-отчёт: нет строки «Кейсы: <sha256>»');
  if (!verdict) errors.push('QA-отчёт: нет строки «Вердикт: PASS|FAIL»');
  if (scopeLine === undefined) errors.push('QA-отчёт: нет строки «Объём: UC-…» (её печатает node scripts/check-state.js --qa-scope)');
  if (!tree || !cases || !verdict || scopeLine === undefined) return errors;
  const scope = uniq(scopeLine.match(UC_ANY_RE) || []);

  if (cases !== casesHash) errors.push('QA-отчёт устарел: набор user-кейсов изменился после прохода тестировщика');
  if (tree !== treeHash) errors.push('QA-отчёт устарел: код или тесты изменились после прохода тестировщика — запусти qa-tester заново');
  if (verdict !== 'PASS') errors.push(`QA-отчёт: Вердикт ${verdict} — проблемы нужно исправить и повторить проход`);

  const rows = new Map([...text.matchAll(/^\|\s*(UC-[A-Z]+-\d+)\s*\|\s*(\w+(?:\s*\(e2e\))?)\s*\|/gm)].map((m) => [m[1], m[2].replace(/\s+/g, ' ')]));
  for (const id of requiredIds) {
    if (!scope.includes(id)) errors.push(`QA-отчёт: кейс ${id} обязателен (контракт задачи или полный проход), но не вошёл в «Объём»`);
  }
  for (const id of scope) {
    if (!activeIds.includes(id)) errors.push(`QA-отчёт: кейс ${id} из «Объёма» не active в наборе user-кейсов`);
    else if (!rows.has(id)) errors.push(`QA-отчёт: кейс ${id} не пройден (нет в матрице)`);
    else if (rows.get(id) === 'pass (e2e)') {
      if (!taggedIds.includes(id)) errors.push(`QA-отчёт: кейс ${id} отмечен «pass (e2e)», но e2e-теста с тегом [${id}] нет`);
    } else if (rows.get(id) !== 'pass') errors.push(`QA-отчёт: кейс ${id} — ${rows.get(id)}`);
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

function currentBranch(root) {
  try {
    return require('node:child_process')
      .execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim();
  } catch {
    return null; // не git-репозиторий
  }
}

// Пути диффа задачи: рабочее дерево + индекс + коммиты ветки относительно merge-base с develop (иначе main), плюс неотслеживаемые.
// Нет ни develop, ни main — от HEAD. Не git-репозиторий — пустой список.
function changedPaths(root) {
  const { execFileSync } = require('node:child_process');
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const lines = (out) => out.split('\n').filter(Boolean);
  try {
    let base = null;
    for (const ref of ['develop', 'main']) {
      try {
        base = git('merge-base', 'HEAD', ref).trim();
        break;
      } catch {
        // ветки нет — пробуем следующую
      }
    }
    if (!base) {
      base = 'HEAD';
      console.error('  ⚠ нет общего предка с develop и main — триггеры полного прохода считаются только по незакоммиченным правкам');
    }
    return uniq([...lines(git('diff', '--name-only', base)), ...lines(git('ls-files', '--others', '--exclude-standard'))]);
  } catch (e) {
    console.error(`  ⚠ не удалось получить дифф задачи, триггеры полного прохода не определены: ${String(e.message).split('\n')[0]}`);
    return [];
  }
}

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

// Текст done/<ID>.md задачи или null (нет ID или файла).
const readDoneFile = (root, taskId) => (taskId ? readIf(path.join(root, doneFileOf(taskId))) : null);

function main(argv) {
  const args = { root: path.resolve(__dirname, '..'), requireContract: false, behaviorReport: null, requireQa: false, treeHash: false, qaScope: false, qaReportPath: false, full: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') args.root = path.resolve(argv[++i]);
    else if (argv[i] === '--require-contract') args.requireContract = true;
    else if (argv[i] === '--behavior-report') args.behaviorReport = path.resolve(argv[++i]);
    else if (argv[i] === '--require-qa') args.requireQa = true;
    else if (argv[i] === '--tree-hash') args.treeHash = true;
    else if (argv[i] === '--cases-hash') args.casesHash = true;
    else if (argv[i] === '--qa-scope') args.qaScope = true;
    else if (argv[i] === '--qa-report-path') args.qaReportPath = true;
    else if (argv[i] === '--full') args.full = true;
  }
  const at = (rel) => path.join(args.root, rel);
  if (args.treeHash) {
    console.log(codeTreeHash(args.root));
    return 0;
  }
  if (args.casesHash) {
    // Отпечаток набора user-кейсов для шапки QA-отчёта
    console.log(hashText(casesBundle(args.root).text));
    return 0;
  }
  const reportPath = qaReportPath(currentBranch(args.root));
  if (args.qaReportPath) {
    // Куда qa-tester пишет отчёт и откуда его читает --require-qa
    console.log(reportPath);
    return 0;
  }
  const errors = [];
  const warnings = [];

  if (!args.qaScope) console.log('==> Проверка состояния: кейсы ↔ API ↔ код ↔ поведение');

  const loaded = loadCaseSet(args.root);
  if (loaded.bundle.files.every((f) => f.path !== CASES_FILE)) {
    console.log(`  ✗ нет ${CASES_FILE}`);
    return 1;
  }
  const casesText = loaded.bundle.text;
  errors.push(...checkLock(casesText, readIf(at(LOCK_FILE))));
  errors.push(...loaded.errors);
  const { cases } = loaded;
  const activeIds = cases.filter((c) => c.status === 'active').map((c) => c.id);
  const branch = currentBranch(args.root);
  const taskId = taskIdFromBranch(branch);
  const contract = taskCaseIds({ tasksMd: readIf(at(TASKS_FILE)), doneMd: readDoneFile(args.root, taskId), taskId });
  // Полный проход нужен только если объём запрошен (--qa-scope, --require-qa): дифф считается не для каждой проверки
  const triggers = args.qaScope || args.requireQa ? qaTriggers({ paths: changedPaths(args.root), branch }) : [];
  const scope = qaScope({ contractIds: contract.ids, activeIds, full: args.full || triggers.length > 0 });
  scope.errors.unshift(...contract.errors);
  if (args.qaScope) {
    if (args.full) console.error('  ℹ полный проход: флаг --full');
    for (const t of triggers) console.error(`  ℹ полный проход: ${t}`);
    // Объём прохода qa-tester: строка «Объём:» его отчёта
    for (const e of scope.errors) console.error(`  ✗ ${e}`);
    console.log(scope.ids.join(', '));
    return scope.errors.length ? 1 : 0;
  }

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
      ...scope.errors,
      ...checkQaReport(readIf(at(reportPath)), {
        casesHash: hashText(casesText),
        activeIds,
        requiredIds: scope.ids,
        treeHash,
        taggedIds: scanned.tags.map((t) => t.id),
        reportPath,
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
  parseIndex,
  checkIndex,
  bundleText,
  casesBundle,
  loadCaseSet,
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
  qaTriggers,
  changedPaths,
  currentBranch,
  taskIdFromBranch,
  readDoneFile,
  qaReportPath,
  contractCaseIds,
  doneCaseIds,
  taskCaseIds,
  qaScope,
  checkQaReport,
  codeTreeHash,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
