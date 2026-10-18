// Тесты чекера состояния (node --test scripts/). Пишутся до реализации scripts/check-state.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const S = require('./check-state.js');

const caseBlock = (over = {}) => {
  const f = {
    id: 'UC-AUTH-01',
    title: 'Вход',
    status: 'active',
    description: 'Человек входит и видит мессенджер.',
    steps: '1. Открыть.',
    expected: 'Мессенджер открыт.',
    api: ['GET /api/auth/session'],
    ...over,
  };
  const lines = [`### ${f.id} — ${f.title}`];
  if (f.status !== null) lines.push(`Статус: ${f.status}`);
  if (f.description !== null) lines.push(`Описание: ${f.description}`);
  if (f.steps !== null) lines.push(`Шаги: ${f.steps}`);
  if (f.expected !== null) lines.push(`Ожидается: ${f.expected}`);
  for (const a of f.api) lines.push(`API: ${a}`);
  return lines.join('\n');
};
const doc = (...blocks) => `# Кейсы\n\nпреамбула\n\n${blocks.join('\n\n')}\n`;

// Набор кейсов из индекса и файлов по областям (FE-128)
const INDEX = 'docs/user-cases.md';
const caseFile = (area) => `docs/user-cases/${area}.md`;
const indexDoc = (rows) =>
  '# User-кейсы\n\nпояснение\n\n## Вход\n\n| ID | Название | Статус | Файл |\n|---|---|---|---|\n' +
  rows.map((r) => `| ${r.id} | ${r.title} | ${r.status} | ${r.file} |`).join('\n') +
  '\n';
const indexFor = (md, file) => indexDoc(S.parseCases(md).cases.map((c) => ({ ...c, file })));
// md — текст файла кейсов одной области; возвращает файлы набора (индекс + файл области)
const caseSet = (md, area = 'auth') => ({ [INDEX]: indexFor(md, caseFile(area)), [caseFile(area)]: md });
const toBundle = (files) => S.bundleText(Object.entries(files).map(([p, text]) => ({ path: p, text })));
const hashOfSet = (files) => S.hashText(toBundle(files));
const lockOf = (files) => hashOfSet(files) + '\n';

test.describe('parseCases', () => {
  test('разбирает поля кейса', () => {
    const { cases, errors } = S.parseCases(doc(caseBlock()));
    assert.deepEqual(errors, []);
    assert.equal(cases.length, 1);
    assert.deepEqual(cases[0], {
      id: 'UC-AUTH-01',
      title: 'Вход',
      status: 'active',
      description: 'Человек входит и видит мессенджер.',
      steps: '1. Открыть.',
      expected: 'Мессенджер открыт.',
      api: ['GET /api/auth/session'],
    });
  });

  test('несколько API-строк и кейс без API допустимы', () => {
    const { cases, errors } = S.parseCases(
      doc(caseBlock({ api: ['GET /api/a', 'POST /api/b'] }), caseBlock({ id: 'UC-AUTH-02', api: [] }))
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(cases[0].api, ['GET /api/a', 'POST /api/b']);
    assert.deepEqual(cases[1].api, []);
  });

  test('пустое описание — ошибка', () => {
    const { errors } = S.parseCases(doc(caseBlock({ description: '' })));
    assert.ok(errors.some((e) => e.includes('UC-AUTH-01') && e.includes('Описание')), errors.join('\n'));
  });

  test('нет поля «Описание» — ошибка', () => {
    const { errors } = S.parseCases(doc(caseBlock({ description: null })));
    assert.ok(errors.some((e) => e.includes('UC-AUTH-01') && e.includes('Описание')));
  });

  test('нет «Шагов» или «Ожидается» — ошибка', () => {
    const a = S.parseCases(doc(caseBlock({ steps: null }))).errors;
    const b = S.parseCases(doc(caseBlock({ expected: null }))).errors;
    assert.ok(a.some((e) => e.includes('Шаги')));
    assert.ok(b.some((e) => e.includes('Ожидается')));
  });

  test('неизвестный статус и отсутствие статуса — ошибки', () => {
    assert.ok(S.parseCases(doc(caseBlock({ status: 'done' }))).errors.some((e) => e.includes('Статус')));
    assert.ok(S.parseCases(doc(caseBlock({ status: null }))).errors.some((e) => e.includes('Статус')));
  });

  test('повторяющийся ID — ошибка', () => {
    const { errors } = S.parseCases(doc(caseBlock(), caseBlock()));
    assert.ok(errors.some((e) => e.includes('UC-AUTH-01') && e.includes('повтор')));
  });

  test('ID неверного формата — ошибка', () => {
    const { errors } = S.parseCases(doc(caseBlock({ id: 'UC-auth-1' })));
    assert.ok(errors.some((e) => e.includes('UC-auth-1')));
  });

  test('неверная строка API — ошибка', () => {
    const { errors } = S.parseCases(doc(caseBlock({ api: ['FETCH api/x'] })));
    assert.ok(errors.some((e) => e.includes('API')));
  });

  test('документ без кейсов — ошибка', () => {
    assert.ok(S.parseCases('# пусто\n').errors.length > 0);
  });
});

test.describe('parseIndex', () => {
  const idx = indexDoc([
    { id: 'UC-AUTH-01', title: 'Вход', status: 'active', file: 'docs/user-cases/auth.md' },
    { id: 'UC-CHAT-04', title: 'Создание чата', status: 'planned', file: 'docs/user-cases/chat.md' },
  ]);

  test('разбирает строки таблиц всех областей', () => {
    const { rows, errors } = S.parseIndex(idx);
    assert.deepEqual(errors, []);
    assert.deepEqual(rows, [
      { id: 'UC-AUTH-01', title: 'Вход', status: 'active', file: 'docs/user-cases/auth.md' },
      { id: 'UC-CHAT-04', title: 'Создание чата', status: 'planned', file: 'docs/user-cases/chat.md' },
    ]);
  });

  test('шапка и разделитель таблицы строками не считаются; текст вне таблиц игнорируется', () => {
    assert.equal(S.parseIndex(idx).rows.length, 2);
  });

  test('индекс без строк — ошибка', () => {
    assert.ok(S.parseIndex('# User-кейсы\n\nтекст\n').errors.length > 0);
  });

  test('дубль ID в индексе — ошибка', () => {
    const row = { id: 'UC-AUTH-01', title: 'Вход', status: 'active', file: 'docs/user-cases/auth.md' };
    assert.ok(S.parseIndex(indexDoc([row, row])).errors.some((e) => e.includes('UC-AUTH-01')));
  });
});

test.describe('checkIndex', () => {
  const row = (id, status = 'active', file = 'docs/user-cases/auth.md') => ({ id, title: 't', status, file });
  const c = (id, status = 'active', title = 't') => ({ id, status, title });

  test('название в индексе не совпадает с заголовком кейса в файле — ошибка', () => {
    const errors = S.checkIndex([row('UC-AUTH-01')], { 'docs/user-cases/auth.md': [c('UC-AUTH-01', 'active', 'Другое')] });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /UC-AUTH-01.*назван/);
  });

  test('согласованный набор — без ошибок', () => {
    const rows = [row('UC-AUTH-01'), row('UC-CHAT-04', 'planned', 'docs/user-cases/chat.md')];
    const files = { 'docs/user-cases/auth.md': [c('UC-AUTH-01')], 'docs/user-cases/chat.md': [c('UC-CHAT-04', 'planned')] };
    assert.deepEqual(S.checkIndex(rows, files), []);
  });

  test('статус в индексе не совпадает со статусом кейса', () => {
    const errors = S.checkIndex([row('UC-AUTH-01', 'planned')], { 'docs/user-cases/auth.md': [c('UC-AUTH-01')] });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /UC-AUTH-01.*статус/i);
  });

  test('ID из индекса нет в указанном файле', () => {
    const errors = S.checkIndex([row('UC-AUTH-02')], { 'docs/user-cases/auth.md': [c('UC-AUTH-01')] });
    assert.ok(errors.some((e) => e.includes('UC-AUTH-02')), errors.join('\n'));
  });

  test('кейс из файла не указан в индексе', () => {
    const errors = S.checkIndex([row('UC-AUTH-01')], { 'docs/user-cases/auth.md': [c('UC-AUTH-01'), c('UC-AUTH-02')] });
    assert.ok(errors.some((e) => e.includes('UC-AUTH-02') && e.includes('индекс')), errors.join('\n'));
  });

  test('один ID в двух файлах', () => {
    const rows = [row('UC-AUTH-01')];
    const files = { 'docs/user-cases/auth.md': [c('UC-AUTH-01')], 'docs/user-cases/chat.md': [c('UC-AUTH-01')] };
    assert.ok(S.checkIndex(rows, files).some((e) => e.includes('UC-AUTH-01') && /дубл|повтор/i.test(e)));
  });

  test('файл из индекса не существует', () => {
    const errors = S.checkIndex([row('UC-AUTH-01', 'active', 'docs/user-cases/zzz.md')], {});
    assert.ok(errors.some((e) => e.includes('zzz.md')), errors.join('\n'));
  });

  test('файл в docs/user-cases/ без строк в индексе', () => {
    const errors = S.checkIndex([row('UC-AUTH-01')], { 'docs/user-cases/auth.md': [c('UC-AUTH-01')], 'docs/user-cases/extra.md': [] });
    assert.ok(errors.some((e) => e.includes('extra.md')), errors.join('\n'));
  });
});

test.describe('casesBundle и хэш набора', () => {
  const base = caseSet(doc(caseBlock()));
  const mkRoot = (files) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-'));
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), content);
    }
    return root;
  };
  const hashAt = (files) => S.hashText(S.casesBundle(mkRoot(files)).text);

  test('папка с именем *.md в docs/user-cases/ не роняет чтение и в набор не входит', () => {
    const root = mkRoot(base);
    fs.mkdirSync(path.join(root, 'docs/user-cases/dir.md'));
    assert.deepEqual(S.casesBundle(root).files.map((f) => f.path), [INDEX, caseFile('auth')]);
  });

  test('симлинк на файл кейсов входит в набор', () => {
    const root = mkRoot({ ...base, 'elsewhere/extra.txt': 'z' });
    fs.symlinkSync(path.join(root, 'elsewhere/extra.txt'), path.join(root, 'docs/user-cases/link.md'));
    assert.deepEqual(S.casesBundle(root).files.map((f) => f.path), [INDEX, caseFile('auth'), caseFile('link')]);
  });

  test('индекс первым, затем файлы по алфавиту', () => {
    const root = mkRoot({ ...base, [caseFile('chat')]: 'x', [caseFile('admin')]: 'y' });
    assert.deepEqual(S.casesBundle(root).files.map((f) => f.path), [INDEX, caseFile('admin'), caseFile('auth'), caseFile('chat')]);
  });

  test('результат не зависит от порядка создания файлов', () => {
    const a = hashAt({ ...base, [caseFile('chat')]: 'x', [caseFile('admin')]: 'y' });
    const b = hashAt({ [caseFile('admin')]: 'y', [caseFile('chat')]: 'x', ...base });
    assert.equal(a, b);
  });

  test('хэш совпадает с хэшем текста bundleText', () => {
    assert.equal(hashAt(base), hashOfSet(base));
  });

  test('хэш меняется при правке индекса', () => {
    assert.notEqual(hashAt(base), hashAt({ ...base, [INDEX]: base[INDEX] + 'x' }));
  });

  test('хэш меняется при правке файла кейсов', () => {
    assert.notEqual(hashAt(base), hashAt({ ...base, [caseFile('auth')]: base[caseFile('auth')] + 'x' }));
  });

  test('хэш меняется при переименовании файла (содержимое прежнее)', () => {
    const renamed = { [INDEX]: base[INDEX], [caseFile('login')]: base[caseFile('auth')] };
    assert.notEqual(hashAt(base), hashAt(renamed));
  });

  test('хэш меняется при добавлении файла', () => {
    assert.notEqual(hashAt(base), hashAt({ ...base, [caseFile('extra')]: '' }));
  });

  test('без каталога docs/user-cases остаётся один индекс', () => {
    const root = mkRoot({ [INDEX]: base[INDEX] });
    assert.deepEqual(S.casesBundle(root).files.map((f) => f.path), [INDEX]);
  });
});

test.describe('loadCaseSet', () => {
  const mk = (files) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'load-'));
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), content);
    }
    return root;
  };
  const chat = doc(caseBlock({ id: 'UC-CHAT-01', title: 'Чат' }));
  const auth = doc(caseBlock());
  const full = () => ({
    [INDEX]: indexDoc([
      { id: 'UC-AUTH-01', title: 'Вход', status: 'active', file: caseFile('auth') },
      { id: 'UC-CHAT-01', title: 'Чат', status: 'active', file: caseFile('chat') },
    ]),
    [caseFile('auth')]: auth,
    [caseFile('chat')]: chat,
  });

  test('собирает кейсы всех файлов', () => {
    const { cases, errors } = S.loadCaseSet(mk(full()));
    assert.deepEqual(errors, []);
    assert.deepEqual(cases.map((c) => c.id).sort(), ['UC-AUTH-01', 'UC-CHAT-01']);
  });

  test('расхождение статуса индекс ↔ файл — ошибка', () => {
    const files = full();
    files[INDEX] = files[INDEX].replace('UC-CHAT-01 | Чат | active', 'UC-CHAT-01 | Чат | planned');
    assert.ok(S.loadCaseSet(mk(files)).errors.some((e) => e.includes('UC-CHAT-01')));
  });

  test('кейс не в индексе — ошибка', () => {
    const files = { ...full(), [caseFile('chat')]: doc(caseBlock({ id: 'UC-CHAT-01', title: 'Чат' }), caseBlock({ id: 'UC-CHAT-02', title: 'Ещё' })) };
    assert.ok(S.loadCaseSet(mk(files)).errors.some((e) => e.includes('UC-CHAT-02')));
  });

  test('дубль ID между файлами — ошибка', () => {
    const files = { ...full(), [caseFile('chat')]: auth };
    assert.ok(S.loadCaseSet(mk(files)).errors.some((e) => e.includes('UC-AUTH-01')));
  });

  test('лишний файл без строк в индексе — ошибка', () => {
    const files = { ...full(), [caseFile('extra')]: doc(caseBlock({ id: 'UC-EXTRA-01', title: 'x' })) };
    assert.ok(S.loadCaseSet(mk(files)).errors.some((e) => e.includes('extra.md')));
  });

  test('ошибка разбора кейса называет файл', () => {
    const files = { ...full(), [caseFile('chat')]: doc(caseBlock({ id: 'UC-CHAT-01', title: 'Чат', description: '' })) };
    assert.ok(S.loadCaseSet(mk(files)).errors.some((e) => e.includes('chat.md') && e.includes('Описание')));
  });

  test('нет индекса — ошибка', () => {
    const files = full();
    delete files[INDEX];
    assert.ok(S.loadCaseSet(mk(files)).errors.length > 0);
  });
});

test.describe('checkLock', () => {
  test('совпадение хэша — без ошибок', () => {
    const text = doc(caseBlock());
    assert.deepEqual(S.checkLock(text, S.hashText(text)), []);
  });

  test('пробелы по краям хэша в файле не мешают', () => {
    const text = doc(caseBlock());
    assert.deepEqual(S.checkLock(text, `${S.hashText(text)}\n`), []);
  });

  test('изменённый документ — ошибка с подсказкой про утверждение', () => {
    const errors = S.checkLock(doc(caseBlock()) + 'правка', S.hashText(doc(caseBlock())));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /approve-usecases\.sh/);
  });

  test('нет файла хэша — ошибка «не утверждён»', () => {
    const errors = S.checkLock(doc(caseBlock()), null);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /не утвержд/);
  });
});

test.describe('scanTests', () => {
  const spec = (body) => `const { test, expect } = require('@playwright/test');\n${body}\n`;

  test('находит теги [UC-…] в названиях, в том числе в шаблонных строках', () => {
    const { tags, errors } = S.scanTests({
      'e2e/a.spec.js': spec(
        "test('[UC-AUTH-01] вход', async ({ page }) => { expect(1).toBe(1); });\n" +
          'for (const p of ps) { test(`[UC-AUTH-02] вход ${p}`, async () => { expect(1).toBe(1); }); }'
      ),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(tags.map((t) => t.id).sort(), ['UC-AUTH-01', 'UC-AUTH-02']);
    assert.equal(tags[0].file, 'e2e/a.spec.js');
  });

  test('несколько тегов в одном названии', () => {
    const { tags } = S.scanTests({
      'e2e/a.spec.js': spec("test('[UC-AUTH-01][UC-SESSION-01] вход и перезагрузка', async () => { expect(1).toBe(1); });"),
    });
    assert.deepEqual(tags.map((t) => t.id).sort(), ['UC-AUTH-01', 'UC-SESSION-01']);
  });

  test('test.skip / test.fixme / test.only — ошибка', () => {
    for (const mod of ['skip', 'fixme', 'only', 'fail']) {
      const { errors } = S.scanTests({
        'e2e/a.spec.js': spec(`test.${mod}('[UC-AUTH-01] x', async () => { expect(1).toBe(1); });`),
      });
      assert.ok(errors.some((e) => e.includes(mod)), `${mod}: ${errors.join('|')}`);
    }
  });

  test('test.describe.skip — ошибка', () => {
    const { errors } = S.scanTests({
      'e2e/a.spec.js': spec("test.describe.skip('группа', () => {});"),
    });
    assert.ok(errors.some((e) => e.includes('skip')));
  });

  test('тест без expect — ошибка с именем файла', () => {
    const { errors } = S.scanTests({
      'e2e/a.spec.js': spec(
        "test('[UC-AUTH-01] пустой', async ({ page }) => { await page.goto('/'); });\n" +
          "test('[UC-AUTH-02] с проверкой', async () => { expect(1).toBe(1); });"
      ),
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /a\.spec\.js/);
    assert.match(errors[0], /UC-AUTH-01/);
  });

  test('test.describe не считается тестом без expect', () => {
    const { errors } = S.scanTests({
      'e2e/a.spec.js': spec(
        "test.describe('группа', () => {\n  test('[UC-AUTH-01] a', async () => { expect(1).toBe(1); });\n});"
      ),
    });
    assert.deepEqual(errors, []);
  });

  test('закомментированный тест не засчитывается (// и /* */)', () => {
    const { tags } = S.scanTests({
      'e2e/a.spec.js': spec(
        "// test('[UC-AUTH-01] x', async () => { expect(1).toBe(1); });\n" +
          "/* test('[UC-AUTH-02] y', async () => { expect(1).toBe(1); }); */\n" +
          "/*\n test('[UC-AUTH-03] z', async () => { expect(1).toBe(1); });\n*/\n" +
          "test('[UC-AUTH-04] живой', async () => { expect(1).toBe(1); });"
      ),
    });
    assert.deepEqual(tags.map((t) => t.id), ['UC-AUTH-04']);
  });

  test('expect в комментарии не спасает тест без проверок', () => {
    const { errors } = S.scanTests({
      'e2e/a.spec.js': spec("test('[UC-AUTH-01] a', async () => { /* expect(1).toBe(1) */ // expect(2)\n });"),
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /без expect/);
  });

  test('// внутри строк и URL не обрезает код', () => {
    const { tags, errors } = S.scanTests({
      'e2e/a.spec.js': spec(
        "test('[UC-AUTH-01] url', async ({ page }) => { await page.goto('http://localhost:3333/a'); expect(1).toBe(1); });\n" +
          'test(`[UC-AUTH-02] ${"//"} /* не комментарий */`, async () => { expect(1).toBe(1); });\n' +
          "test('[UC-AUTH-03] кавычка \\' // внутри', async () => { expect(1).toBe(1); });"
      ),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(tags.map((t) => t.id), ['UC-AUTH-01', 'UC-AUTH-02', 'UC-AUTH-03']);
  });

  test('тест без тега допустим (технический), тег не попадает в результат', () => {
    const { tags, errors } = S.scanTests({
      'e2e/a.spec.js': spec("test('контракт: 401', async () => { expect(1).toBe(1); });"),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(tags, []);
  });
});

test.describe('checkCoverage', () => {
  const cases = [
    { id: 'UC-A-01', status: 'active' },
    { id: 'UC-A-02', status: 'planned' },
  ];

  test('все active покрыты — без ошибок', () => {
    assert.deepEqual(S.checkCoverage(cases, [{ id: 'UC-A-01', file: 'e2e/a.spec.js' }]), []);
  });

  test('active без теста — ошибка', () => {
    const errors = S.checkCoverage(cases, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /UC-A-01/);
  });

  test('тег несуществующего кейса — ошибка', () => {
    const errors = S.checkCoverage(cases, [
      { id: 'UC-A-01', file: 'e2e/a.spec.js' },
      { id: 'UC-Z-99', file: 'e2e/a.spec.js' },
    ]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /UC-Z-99/);
  });

  test('тест на planned-кейс — ошибка с подсказкой про перевод в active', () => {
    const errors = S.checkCoverage(cases, [
      { id: 'UC-A-01', file: 'e2e/a.spec.js' },
      { id: 'UC-A-02', file: 'e2e/b.spec.js' },
    ]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /UC-A-02/);
    assert.match(errors[0], /planned/);
  });
});

test.describe('API ↔ код', () => {
  const contractMd = [
    '### 2.3. `GET /api/auth/session`',
    'текст',
    '1. Клиент делает навигацию на `GET /api/auth/{google|github}/start`.',
    '### 2.5. `POST /api/auth/logout`',
    '### 3.5. `PATCH /api/chats/:id` (CSRF)',
    '### 3.7. `DELETE /api/chats/:id/members/:userId` (CSRF)',
  ].join('\n');

  test('parseContract нормализует параметры пути', () => {
    const set = S.parseContract(contractMd);
    assert.ok(set.has('GET /api/auth/session'));
    assert.ok(set.has('GET /api/auth/:p/start'));
    assert.ok(set.has('POST /api/auth/logout'));
    assert.ok(set.has('PATCH /api/chats/:p'));
    assert.ok(set.has('DELETE /api/chats/:p/members/:p'));
  });

  test('normalizeEndpoint: {x}, :x и ${x} → :p, хвост со слэшем и query отброшены', () => {
    assert.equal(S.normalizeEndpoint('get', '/api/chats/{id}/messages?limit=1'), 'GET /api/chats/:p/messages');
    assert.equal(S.normalizeEndpoint('GET', '/api/auth/${id}/start'), 'GET /api/auth/:p/start');
  });

  test('scanClientPaths находит /api/-литералы в кавычках и шаблонах', () => {
    const found = S.scanClientPaths({
      'src/a.js': 'apiRequest("/api/auth/session"); const h = `/api/auth/${id}/start`; const x = "/mock-provider/x";',
    });
    assert.deepEqual(found.map((f) => f.path).sort(), ['/api/auth/:p/start', '/api/auth/session']);
    assert.equal(found[0].file, 'src/a.js');
  });

  test('scanMockRoutes читает комментарии «// METHOD /api/…» сервера', () => {
    const routes = S.scanMockRoutes(
      'function a() {\n  // GET /api/auth/session\n  // POST /api/auth/logout\n  // GET /api/auth/{provider}/start\n}'
    );
    assert.deepEqual([...routes].sort(), ['GET /api/auth/:p/start', 'GET /api/auth/session', 'POST /api/auth/logout']);
  });

  const contract = new Set(['GET /api/auth/session', 'POST /api/auth/logout']);
  const base = {
    contract,
    clientPaths: [{ path: '/api/auth/session', file: 'src/a.js' }],
    mockRoutes: new Set(['GET /api/auth/session', 'POST /api/auth/logout']),
    cases: [{ id: 'UC-A-01', status: 'active', api: ['GET /api/auth/session'] }],
  };

  test('согласованное состояние — без ошибок', () => {
    assert.deepEqual(S.checkApi(base), []);
  });

  test('вызов клиента вне контракта — ошибка с файлом', () => {
    const errors = S.checkApi({ ...base, clientPaths: [{ path: '/api/nope', file: 'src/a.js' }] });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /\/api\/nope/);
    assert.match(errors[0], /src\/a\.js/);
  });

  test('маршрут mock-BFF вне контракта — ошибка', () => {
    const errors = S.checkApi({ ...base, mockRoutes: new Set([...base.mockRoutes, 'GET /api/extra']) });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /GET \/api\/extra/);
  });

  test('API кейса вне контракта — ошибка', () => {
    const errors = S.checkApi({ ...base, cases: [{ id: 'UC-A-01', status: 'active', api: ['GET /api/zzz'] }] });
    assert.ok(errors.some((e) => e.includes('UC-A-01') && e.includes('GET /api/zzz')));
  });

  test('API active-кейса без маршрута в mock-BFF — ошибка', () => {
    const errors = S.checkApi({
      ...base,
      mockRoutes: new Set(['GET /api/auth/session']),
      cases: [{ id: 'UC-A-02', status: 'active', api: ['POST /api/auth/logout'] }],
    });
    assert.ok(errors.some((e) => e.includes('UC-A-02') && e.includes('mock-BFF')));
  });

  test('API planned-кейса может отсутствовать в mock-BFF', () => {
    const errors = S.checkApi({
      ...base,
      mockRoutes: new Set(['GET /api/auth/session']),
      cases: [{ id: 'UC-A-03', status: 'planned', api: ['POST /api/auth/logout'] }],
    });
    assert.deepEqual(errors, []);
  });
});

test.describe('parseSpecContract (спека входа по паролю, временно, FE-86)', () => {
  const specMd = [
    '# Спека',
    '## 1. Что меняется',
    'Не меняется: `GET /api/chats`.',
    '## 2. Эндпоинты',
    '### 2.1. `POST /api/auth/register`',
    '### 2.6. `PATCH /api/me`',
    '### 2.8. Админка',
    '- `GET /api/admin/users`, `PATCH /api/admin/users/:id` — без изменений.',
    '- `POST/GET/DELETE /api/admin/invites*` удаляются.',
    '### 2.9. Удаляются',
    '- `POST /api/auth/passkey/login/options`, `POST /api/invites/inspect`.',
    '###   2.7.   ',
    '- `POST /api/me/password`',
    '### 2.10. Будущее',
    '- `GET /api/future`',
    '## 3. Модели',
    'Пример: `GET /api/models-only`.',
  ].join('\n');

  test('берёт эндпоинты из §2.1–§2.8 и нормализует параметры', () => {
    const set = S.parseSpecContract(specMd);
    assert.ok(set.has('POST /api/auth/register'));
    assert.ok(set.has('PATCH /api/me'));
    assert.ok(set.has('GET /api/admin/users'));
    assert.ok(set.has('PATCH /api/admin/users/:p'));
  });

  test('не берёт §2.9 «Удаляются», шаблоны со звёздочкой и другие разделы', () => {
    const set = S.parseSpecContract(specMd);
    assert.ok(![...set].some((e) => e.includes('passkey') || e.includes('invites')));
    assert.ok(!set.has('GET /api/chats'));
    assert.ok(!set.has('GET /api/models-only'));
    assert.ok(!set.has('GET /api/future'));
  });

  test('заголовок с лишними пробелами распознаётся', () => {
    assert.ok(S.parseSpecContract(specMd).has('POST /api/me/password'));
  });
});

test.describe('behaviorMatrix', () => {
  const report = (specs) => ({ suites: [{ title: 'a.spec.js', suites: [{ title: 'группа', specs, suites: [] }], specs: [] }] });
  const spec = (title, status) => ({
    title,
    ok: status === 'expected',
    tests: [{ status, results: [{ status: status === 'expected' ? 'passed' : 'failed' }] }],
  });
  const cases = [
    { id: 'UC-A-01', status: 'active' },
    { id: 'UC-A-02', status: 'active' },
    { id: 'UC-A-03', status: 'planned' },
  ];

  test('все тесты кейса зелёные — pass', () => {
    const { rows, errors } = S.behaviorMatrix(
      report([spec('[UC-A-01] x', 'expected'), spec('[UC-A-02] y', 'expected')]),
      cases
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(rows.map((r) => [r.id, r.state]), [
      ['UC-A-01', 'pass'],
      ['UC-A-02', 'pass'],
    ]);
  });

  test('упавший тест нарушает кейс — fail и ошибка', () => {
    const { rows, errors } = S.behaviorMatrix(
      report([spec('[UC-A-01] x', 'expected'), spec('[UC-A-02] y', 'unexpected')]),
      cases
    );
    assert.equal(rows.find((r) => r.id === 'UC-A-02').state, 'fail');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /UC-A-02/);
  });

  test('хотя бы один упавший из нескольких тестов кейса — fail', () => {
    const { rows } = S.behaviorMatrix(
      report([spec('[UC-A-01] a', 'expected'), spec('[UC-A-01] b', 'unexpected'), spec('[UC-A-02] y', 'expected')]),
      cases
    );
    assert.equal(rows.find((r) => r.id === 'UC-A-01').state, 'fail');
  });

  test('пропущенный тест не считается прохождением', () => {
    const { rows, errors } = S.behaviorMatrix(
      report([spec('[UC-A-01] a', 'skipped'), spec('[UC-A-02] y', 'expected')]),
      cases
    );
    assert.equal(rows.find((r) => r.id === 'UC-A-01').state, 'fail');
    assert.equal(errors.length, 1);
  });

  test('flaky (прошёл только с ретраем) — fail', () => {
    const { rows } = S.behaviorMatrix(report([spec('[UC-A-01] a', 'flaky'), spec('[UC-A-02] y', 'expected')]), cases);
    assert.equal(rows.find((r) => r.id === 'UC-A-01').state, 'fail');
  });

  test('active-кейс без прогнанных тестов — missing и ошибка', () => {
    const { rows, errors } = S.behaviorMatrix(report([spec('[UC-A-01] a', 'expected')]), cases);
    assert.equal(rows.find((r) => r.id === 'UC-A-02').state, 'missing');
    assert.equal(errors.length, 1);
  });

  test('planned-кейсы в матрице не участвуют', () => {
    const { rows } = S.behaviorMatrix(report([spec('[UC-A-01] a', 'expected'), spec('[UC-A-02] y', 'expected')]), cases);
    assert.equal(rows.some((r) => r.id === 'UC-A-03'), false);
  });

  test('формат матрицы читаем: formatMatrix содержит ID и состояние', () => {
    const { rows } = S.behaviorMatrix(report([spec('[UC-A-01] a', 'expected')]), cases);
    const text = S.formatMatrix(rows);
    assert.match(text, /UC-A-01/);
    assert.match(text, /UC-A-02/);
  });
});

test.describe('checkQaReport', () => {
  const HASH = 'a'.repeat(64);
  const report = (over = {}) => {
    const f = {
      tree: 'tree1234',
      hash: HASH,
      verdict: 'PASS',
      scope: 'UC-A-01, UC-A-02',
      rows: [['UC-A-01', 'pass'], ['UC-A-02', 'pass']],
      problems: [],
      ...over,
    };
    const lines = ['# QA-отчёт', ''];
    if (f.tree !== null) lines.push(`Дерево: ${f.tree}`);
    if (f.scope !== null) lines.push(`Объём: ${f.scope}`);
    if (f.hash !== null) lines.push(`Кейсы: ${f.hash}`);
    if (f.verdict !== null) lines.push(`Вердикт: ${f.verdict}`);
    lines.push('', '## Матрица', '| Кейс | Результат | Комментарий |', '|---|---|---|');
    for (const [id, st] of f.rows) lines.push(`| ${id} | ${st} | — |`);
    lines.push('', '## Проблемы');
    for (const pr of f.problems) lines.push(`### ${pr}`, 'Шаги: 1. …');
    return lines.join('\n');
  };
  const ctx = (over = {}) => ({
    casesHash: HASH,
    activeIds: ['UC-A-01', 'UC-A-02', 'UC-A-03'],
    requiredIds: ['UC-A-01'],
    treeHash: 'tree1234',
    ...over,
  });

  test('свежий отчёт PASS по кейсам объёма — без ошибок', () => {
    assert.deepEqual(S.checkQaReport(report(), ctx()), []);
  });

  test('отчёта нет — ошибка с подсказкой запустить qa-tester', () => {
    const errors = S.checkQaReport(null, ctx());
    assert.equal(errors.length, 1);
    assert.match(errors[0], /qa-tester/);
  });

  test('вердикт FAIL — ошибка', () => {
    const errors = S.checkQaReport(report({ verdict: 'FAIL' }), ctx());
    assert.ok(errors.some((e) => e.includes('Вердикт')));
  });

  test('нет заголовков «Дерево», «Кейсы» или «Вердикт» — ошибки', () => {
    assert.ok(S.checkQaReport(report({ tree: null }), ctx()).some((e) => e.includes('Дерево')));
    assert.ok(S.checkQaReport(report({ hash: null }), ctx()).some((e) => e.includes('Кейсы')));
    assert.ok(S.checkQaReport(report({ verdict: null }), ctx()).some((e) => e.includes('Вердикт')));
  });

  test('документ кейсов изменился после отчёта — устарел', () => {
    const errors = S.checkQaReport(report(), ctx({ casesHash: 'b'.repeat(64) }));
    assert.ok(errors.some((e) => e.includes('кейс') && e.includes('устар')));
  });

  test('код менялся после отчёта (хэш дерева другой) — устарел', () => {
    const errors = S.checkQaReport(report(), ctx({ treeHash: 'other999' }));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /устар/);
  });

  test('кейса из объёма нет в матрице — ошибка', () => {
    const errors = S.checkQaReport(report({ rows: [['UC-A-01', 'pass']] }), ctx());
    assert.ok(errors.some((e) => e.includes('UC-A-02')));
  });

  test('нет строки «Объём» — ошибка', () => {
    const errors = S.checkQaReport(report({ scope: null }), ctx());
    assert.ok(errors.some((e) => e.includes('Объём')));
  });

  test('обязательный кейс (контракт или smoke) не вошёл в объём — ошибка', () => {
    const errors = S.checkQaReport(
      report({ scope: 'UC-A-02', rows: [['UC-A-02', 'pass']] }),
      ctx({ requiredIds: ['UC-A-01', 'UC-A-02'] })
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0], /UC-A-01/);
  });

  test('кейс объёма не active — ошибка', () => {
    const errors = S.checkQaReport(
      report({ scope: 'UC-A-01, UC-Z-09', rows: [['UC-A-01', 'pass'], ['UC-Z-09', 'pass']] }),
      ctx()
    );
    assert.ok(errors.some((e) => e.includes('UC-Z-09') && e.includes('active')));
  });

  test('active-кейсы вне объёма в матрице не требуются', () => {
    const errors = S.checkQaReport(report({ scope: 'UC-A-01', rows: [['UC-A-01', 'pass']] }), ctx());
    assert.deepEqual(errors, []);
  });

  test('кейс не pass в матрице — ошибка', () => {
    const errors = S.checkQaReport(report({ rows: [['UC-A-01', 'pass'], ['UC-A-02', 'fail']] }), ctx());
    assert.ok(errors.some((e) => e.includes('UC-A-02') && e.includes('fail')));
  });

  test('pass (e2e) принимается, если у кейса есть e2e-тест с тегом', () => {
    const errors = S.checkQaReport(
      report({ rows: [['UC-A-01', 'pass'], ['UC-A-02', 'pass (e2e)']] }),
      ctx({ taggedIds: ['UC-A-01', 'UC-A-02'] })
    );
    assert.deepEqual(errors, []);
  });

  test('pass (e2e) без e2e-теста с тегом кейса — ошибка', () => {
    const errors = S.checkQaReport(
      report({ rows: [['UC-A-01', 'pass'], ['UC-A-02', 'pass (e2e)']] }),
      ctx({ taggedIds: ['UC-A-01'] })
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0], /UC-A-02.*e2e/);
  });

  test('pass (e2e) без списка тегов в контексте — ошибка', () => {
    const errors = S.checkQaReport(report({ rows: [['UC-A-01', 'pass'], ['UC-A-02', 'pass (e2e)']] }), ctx());
    assert.ok(errors.some((e) => e.includes('UC-A-02')));
  });

  test('отметка вне pass/pass (e2e) остаётся ошибкой', () => {
    const errors = S.checkQaReport(
      report({ rows: [['UC-A-01', 'pass'], ['UC-A-02', 'fail (e2e)']] }),
      ctx({ taggedIds: ['UC-A-02'] })
    );
    assert.ok(errors.some((e) => e.includes('UC-A-02') && e.includes('fail')));
  });

  test('открытые BLOCKER/MAJOR при вердикте PASS — ошибка', () => {
    const errors = S.checkQaReport(
      report({ problems: ['QA-1 [BLOCKER] UC-A-01 — сломано', 'QA-2 [MAJOR] UC-A-02 — криво'] }),
      ctx()
    );
    assert.ok(errors.some((e) => e.includes('QA-1')));
    assert.ok(errors.some((e) => e.includes('QA-2')));
  });

  test('MINOR и NIT не блокируют', () => {
    const errors = S.checkQaReport(
      report({ problems: ['QA-1 [MINOR] UC-A-01 — мелочь', 'QA-2 [NIT] UC-A-02 — вкус'] }),
      ctx()
    );
    assert.deepEqual(errors, []);
  });
});

test.describe('contractCaseIds', () => {
  const tasks = (wip) => `# Задачи\n\n## В работе\n${wip}\n## Бэклог\n- **FE-9 (P1)** x\n  - Кейсы: UC-OLD-01\n`;

  test('кейсы из поля «Кейсы» задач «В работе», без дублей', () => {
    const md = tasks(
      '- **FE-1 (P1)** a\n  - Цель: x\n  - Кейсы: UC-AUTH-06, UC-AUTH-07; не сломать UC-SESSION-01\n' +
        '- **FE-2 (P2)** b\n  - Кейсы: UC-AUTH-07, UC-MSG-01\n'
    );
    assert.deepEqual(S.contractCaseIds(md), ['UC-AUTH-06', 'UC-AUTH-07', 'UC-SESSION-01', 'UC-MSG-01']);
  });

  test('«Кейсы: нет», пустой раздел или нет файла — пустой список', () => {
    assert.deepEqual(S.contractCaseIds(tasks('- **FE-1 (P1)** a\n  - Кейсы: нет (процесс)\n')), []);
    assert.deepEqual(S.contractCaseIds(tasks('—\n')), []);
    assert.deepEqual(S.contractCaseIds(null), []);
  });

  test('UC-ID в других полях и в бэклоге не считаются', () => {
    const md = tasks('- **FE-1 (P1)** a\n  - Цель: как UC-X-01\n  - Кейсы: UC-A-01\n');
    assert.deepEqual(S.contractCaseIds(md), ['UC-A-01']);
  });
});

test.describe('задача ветки', () => {
  test('taskIdFromBranch: ID из имени ветки задачи, иначе null', () => {
    assert.equal(S.taskIdFromBranch('feature/FE-80-check-cascade'), 'FE-80');
    assert.equal(S.taskIdFromBranch('bugfix/FE-7-x'), 'FE-7');
    assert.equal(S.taskIdFromBranch('chore/login-screen-gaps'), null);
    assert.equal(S.taskIdFromBranch(null), null);
  });

  test('qaReportPath: отчёт qa-tester — файл задачи в .qa/runs/, для ветки без ID — имя ветки (FE-D36)', () => {
    assert.equal(S.qaReportPath('feature/FE-81-mock-bff-port'), '.qa/runs/FE-81.md');
    assert.equal(S.qaReportPath('bugfix/FE-7-x'), '.qa/runs/FE-7.md');
    assert.equal(S.qaReportPath('chore/qa-runs'), '.qa/runs/chore-qa-runs.md');
    assert.doesNotMatch(S.qaReportPath(null), /report\.md$/);
  });

  test('contractCaseIds с ID — только блок этой задачи; задачи нет в «В работе» — null', () => {
    const md = '## В работе\n- **FE-1 (P1)** a\n  - Кейсы: UC-A-01\n- **FE-2 (P1)** b\n  - Кейсы: UC-B-01\n## Бэклог\n';
    assert.deepEqual(S.contractCaseIds(md, 'FE-2'), ['UC-B-01']);
    assert.equal(S.contractCaseIds(md, 'FE-3'), null);
  });

  test('doneCaseIds: поле «Кейсы:» записи задачи из файла done/<ID>.md', () => {
    const md = '- 2026-10-13 — FE-1: x · Кейсы: UC-A-01, UC-A-02 · ревью\n- 2026-10-13 — FE-12: y · Кейсы: UC-Z-01\n- 2026-10-13 — FE-3: без поля\n';
    assert.deepEqual(S.doneCaseIds(md, 'FE-1'), { found: true, ids: ['UC-A-01', 'UC-A-02'], hasField: true });
    assert.deepEqual(S.doneCaseIds(md, 'FE-3'), { found: true, ids: [], hasField: false });
    assert.deepEqual(S.doneCaseIds(md, 'FE-9'), { found: false, ids: [], hasField: false });
  });
});

test.describe('qaScope', () => {
  test('smoke плюс active-кейсы контракта, без дублей, smoke первыми', () => {
    const r = S.qaScope({ smoke: ['UC-S-01', 'UC-S-02'], contractIds: ['UC-A-01', 'UC-S-01'], activeIds: ['UC-S-01', 'UC-S-02', 'UC-A-01'] });
    assert.deepEqual(r, { ids: ['UC-S-01', 'UC-S-02', 'UC-A-01'], errors: [] });
  });

  test('кейсы контракта, которых нет среди active (удаляемые, planned), пропускаются', () => {
    const r = S.qaScope({ smoke: [], contractIds: ['UC-A-01', 'UC-GONE-01'], activeIds: ['UC-A-01'] });
    assert.deepEqual(r, { ids: ['UC-A-01'], errors: [] });
  });

  test('smoke-кейс не active — ошибка с подсказкой обновить QA_SMOKE', () => {
    const r = S.qaScope({ smoke: ['UC-S-01'], contractIds: [], activeIds: ['UC-A-01'] });
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /UC-S-01.*QA_SMOKE/);
  });
});

test.describe('CLI на фикстурном репозитории', () => {
  const cli = path.join(__dirname, 'check-state.js');
  const goodCases = doc(
    caseBlock({ api: ['GET /api/auth/session'] }),
    caseBlock({ id: 'UC-AUTH-02', status: 'planned', api: [] })
  );
  const goodSpec =
    "const { test, expect } = require('@playwright/test');\n" +
    "test('[UC-AUTH-01] вход', async () => { expect(1).toBe(1); });\n";

  const casesFiles = (md) => {
    const files = caseSet(md);
    return { ...files, '.ai/user-cases.sha256': lockOf(files) };
  };

  const makeRoot = (over = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-state-'));
    const files = {
      ...casesFiles(goodCases),
      'e2e/a.spec.js': goodSpec,
      'src/app/api.js': 'export const s = () => fetch("/api/auth/session");\n',
      'mock-bff/server.js': '// GET /api/auth/session\n',
      'docs/client-integration.md': '### 2.3. `GET /api/auth/session`\n',
      ...over,
    };
    for (const [rel, content] of Object.entries(files)) {
      if (content === null) continue;
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), content);
    }
    return root;
  };
  const run = (root, args = [], env = {}) =>
    spawnSync(process.execPath, [cli, '--root', root, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

  test('согласованное состояние — код 0', () => {
    const r = run(makeRoot());
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  test('правка документа без утверждения — код 1', () => {
    const r = run(makeRoot({ [caseFile('auth')]: goodCases + '\nправка\n' }));
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /approve-usecases\.sh/);
  });

  test('правка индекса без утверждения — код 1', () => {
    const r = run(makeRoot({ [INDEX]: caseSet(goodCases)[INDEX] + '\nправка\n' }));
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /approve-usecases\.sh/);
  });

  test('статус в индексе расходится с файлом — код 1', () => {
    const files = caseSet(goodCases);
    const r = run(makeRoot({ ...files, [INDEX]: files[INDEX].replace('| active |', '| planned |'), '.ai/user-cases.sha256': null }));
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /UC-AUTH-01.*статус/i);
  });

  test('--cases-hash печатает хэш набора, он совпадает с lock-файлом', () => {
    const root = makeRoot();
    const r = run(root, ['--cases-hash']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), fs.readFileSync(path.join(root, '.ai/user-cases.sha256'), 'utf8').trim());
  });

  test('active-кейс без e2e-теста — код 1', () => {
    const r = run(makeRoot({ 'e2e/a.spec.js': "const { test, expect } = require('@playwright/test');\n" }));
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /UC-AUTH-01/);
  });

  test('e2e-тест с тегом несуществующего кейса — код 1', () => {
    const r = run(
      makeRoot({ 'e2e/b.spec.js': "test('[UC-ZZZ-01] x', async () => { expect(1).toBe(1); });\n" })
    );
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /UC-ZZZ-01/);
  });

  test('клиент ходит на эндпоинт вне контракта — код 1', () => {
    const r = run(makeRoot({ 'src/app/api.js': 'fetch("/api/secret");\n' }));
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /\/api\/secret/);
  });

  test('нет файла контракта — предупреждение, API-проверка пропущена, код 0', () => {
    const r = run(makeRoot({ 'docs/client-integration.md': null }));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /client-integration\.md/);
  });

  test('--require-contract: нет контракта — код 1', () => {
    const r = run(makeRoot({ 'docs/client-integration.md': null }), ['--require-contract']);
    assert.equal(r.status, 1);
  });

  test('тест-файлы src (*.test.js) не считаются вызовами клиента', () => {
    const r = run(makeRoot({ 'src/app/api.test.js': 'fetch("/api/only-in-test");\n' }));
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  test('--behavior: отчёт с упавшим кейсом — код 1, с зелёным — 0', () => {
    const root = makeRoot();
    const mk = (status) =>
      JSON.stringify({
        suites: [{ title: 'a', specs: [{ title: '[UC-AUTH-01] вход', ok: status === 'expected', tests: [{ status }] }], suites: [] }],
      });
    const good = path.join(root, 'report-good.json');
    const bad = path.join(root, 'report-bad.json');
    fs.writeFileSync(good, mk('expected'));
    fs.writeFileSync(bad, mk('unexpected'));
    assert.equal(run(root, ['--behavior-report', good]).status, 0);
    const r = run(root, ['--behavior-report', bad]);
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /UC-AUTH-01/);
  });

  test.describe('спека входа по паролю (временный источник контракта, FE-86)', () => {
    const SPEC = 'docs/auth-password-spec.md';
    const spec = '## 2. Эндпоинты\n### 2.1. `POST /api/auth/register`\n### 2.6. `PATCH /api/me`\n### 2.9. Удаляются\n- `POST /api/invites/inspect`\n## 3. Модели\n';
    const caseWithApi = (api) =>
      doc(caseBlock({ api: ['GET /api/auth/session', api] }), caseBlock({ id: 'UC-AUTH-02', status: 'planned', api: [] }));
    const withCases = (md, extra = {}) => makeRoot({ ...casesFiles(md), [SPEC]: spec, ...extra });

    test('вызов клиента на эндпоинт из §2.1–§2.8 принимается', () => {
      const r = run(makeRoot({ [SPEC]: spec, 'src/app/api.js': 'fetch("/api/auth/session"); fetch("/api/auth/register"); fetch("/api/me");\n' }));
      assert.equal(r.status, 0, r.stdout + r.stderr);
    });

    test('маршрут mock-BFF из спеки принимается', () => {
      const r = run(makeRoot({ [SPEC]: spec, 'mock-bff/server.js': '// GET /api/auth/session\n// POST /api/auth/register\n' }));
      assert.equal(r.status, 0, r.stdout + r.stderr);
    });

    test('строка API: кейса с эндпоинтом из спеки принимается', () => {
      const r = run(withCases(caseWithApi('POST /api/auth/register'), { 'mock-bff/server.js': '// GET /api/auth/session\n// POST /api/auth/register\n' }));
      assert.equal(r.status, 0, r.stdout + r.stderr);
    });

    test('эндпоинт из §2.9 «Удаляются» остаётся вне контракта', () => {
      const r = run(makeRoot({ [SPEC]: spec, 'src/app/api.js': 'fetch("/api/invites/inspect");\n' }));
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /\/api\/invites\/inspect/);
    });

    test('без спеки эндпоинт из неё вне контракта, ошибок и предупреждений сверх прежних нет', () => {
      const r = run(makeRoot({ 'src/app/api.js': 'fetch("/api/auth/register");\n' }));
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /\/api\/auth\/register/);
      const ok = run(makeRoot());
      assert.equal(ok.status, 0, ok.stdout + ok.stderr);
      assert.doesNotMatch(ok.stdout + ok.stderr, /auth-password-spec|⚠/);
    });

    test('эндпоинты client-integration.md принимаются и при наличии спеки', () => {
      const r = run(makeRoot({ [SPEC]: spec }));
      assert.equal(r.status, 0, r.stdout + r.stderr);
    });

    test('спека есть, а client-integration.md нет — прежнее предупреждение, код 0', () => {
      const r = run(makeRoot({ [SPEC]: spec, 'docs/client-integration.md': null }));
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout + r.stderr, /client-integration\.md/);
    });
  });

  test.describe('--require-qa', () => {
    const { execFileSync } = require('node:child_process');
    const git = (root, ...a) =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: root, encoding: 'utf8' }).trim();
    // Фикстура с настоящими smoke-кейсами (QA_SMOKE) и вторым кейсом для контракта: подмены smoke через окружение нет
    const qaIds = ['UC-AUTH-02', ...S.QA_SMOKE];
    const qaCases = doc(caseBlock(), ...qaIds.map((id) => caseBlock({ id, title: id })));
    const qaSpec = goodSpec + qaIds.map((id) => `test('[${id}] x', async () => { expect(1).toBe(1); });\n`).join('');
    const wip = (body) => `# Задачи\n\n## В работе\n${body}\n## Бэклог\n`;
    const qaReport = (tree, hash, verdict = 'PASS', ids = S.QA_SMOKE) =>
      `# QA-отчёт\n\nДерево: ${tree}\nКейсы: ${hash}\nОбъём: ${ids.join(', ')}\nВердикт: ${verdict}\n\n## Матрица\n| Кейс | Результат | Комментарий |\n|---|---|---|\n` +
      ids.map((id) => `| ${id} | pass | — |\n`).join('') +
      '\n## Проблемы\n';
    const runQa = (root) => run(root, ['--require-qa']);

    const treeOf = (root) => run(root, ['--tree-hash']).stdout.trim();
    const reportPathOf = (root) => run(root, ['--qa-report-path']).stdout.trim();
    const writeReport = (root, ...a) => {
      const file = path.join(root, reportPathOf(root));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, qaReport(treeOf(root), hashOfSet(caseSet(qaCases)), ...a));
    };
    const makeGitRoot = (verdict = 'PASS', over = {}, branch = null) => {
      const root = makeRoot({
        ...casesFiles(qaCases),
        'e2e/a.spec.js': qaSpec,
        ...over,
      });
      git(root, 'init', '-q');
      if (branch) git(root, 'checkout', '-q', '-b', branch);
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'init');
      writeReport(root, verdict);
      return root;
    };

    test('свежий отчёт PASS по smoke — код 0', () => {
      const r = runQa(makeGitRoot('PASS'));
      assert.equal(r.status, 0, r.stdout + r.stderr);
    });

    test('отчёт с вердиктом FAIL — код 1', () => {
      const r = runQa(makeGitRoot('FAIL'));
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /Вердикт/);
    });

    test('правка кода после отчёта (в рабочем дереве) — код 1', () => {
      const root = makeGitRoot();
      fs.appendFileSync(path.join(root, 'src/app/api.js'), '// правка\n');
      const r = runQa(root);
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /устар/);
    });

    test('хэш дерева не зависит от незакоммиченности: коммит без правок не делает отчёт устаревшим', () => {
      const root = makeGitRoot();
      fs.appendFileSync(path.join(root, 'src/app/api.js'), '// правка\n');
      writeReport(root);
      assert.equal(runQa(root).status, 0);
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'task');
      assert.equal(runQa(root).status, 0);
    });

    test('новый неотслеживаемый файл в src после отчёта — код 1', () => {
      const root = makeGitRoot();
      fs.writeFileSync(path.join(root, 'src/app/new.js'), 'export {};\n');
      assert.equal(runQa(root).status, 1);
    });

    test('переменная окружения QA_SMOKE не сужает обязательный объём', () => {
      const root = makeGitRoot();
      writeReport(root, 'PASS', []);
      const r = run(root, ['--require-qa'], { QA_SMOKE: ',' });
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, new RegExp(S.QA_SMOKE[0]));
    });

    test('кейс контракта задачи ветки («В работе») не вошёл в объём отчёта — код 1', () => {
      const root = makeGitRoot('PASS', { '.ai/memory/tasks.md': wip('- **FE-1 (P1)** a\n  - Кейсы: UC-AUTH-02\n') }, 'feature/FE-1-a');
      const r = runQa(root);
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /UC-AUTH-02/);
      writeReport(root, 'PASS', [...S.QA_SMOKE, 'UC-AUTH-02']);
      assert.equal(runQa(root).status, 0, runQa(root).stdout);
    });

    test('задача уже в done/FE-1.md (момент коммита) — кейсы берутся из поля «Кейсы:» её записи', () => {
      const root = makeGitRoot(
        'PASS',
        {
          '.ai/memory/tasks.md': wip('—\n'),
          '.ai/memory/done/FE-1.md': '# FE-1\n\n- 2026-10-13 — FE-1: сделано · Кейсы: UC-AUTH-02 · ревью APPROVE\n',
        },
        'feature/FE-1-a'
      );
      const r = runQa(root);
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /UC-AUTH-02/);
      writeReport(root, 'PASS', [...S.QA_SMOKE, 'UC-AUTH-02']);
      assert.equal(runQa(root).status, 0, runQa(root).stdout);
    });

    test('задача в done/FE-1.md без поля «Кейсы:» — код 1 с подсказкой', () => {
      const root = makeGitRoot(
        'PASS',
        { '.ai/memory/tasks.md': wip('—\n'), '.ai/memory/done/FE-1.md': '# FE-1\n\n- 2026-10-13 — FE-1: сделано\n' },
        'feature/FE-1-a'
      );
      const r = runQa(root);
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /FE-1.*Кейсы/);
    });

    test('задачи ветки нет ни в «В работе», ни в done/ — код 1', () => {
      const root = makeGitRoot('PASS', { '.ai/memory/tasks.md': wip('—\n') }, 'feature/FE-1-a');
      const r = runQa(root);
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /done\/FE-1\.md/);
    });

    test('--qa-scope печатает smoke и active-кейсы контракта только задачи ветки', () => {
      const root = makeGitRoot(
        'PASS',
        { '.ai/memory/tasks.md': wip('- **FE-1 (P1)** a\n  - Кейсы: UC-AUTH-02\n- **FE-2 (P1)** b\n  - Кейсы: UC-AUTH-01\n') },
        'feature/FE-1-a'
      );
      const r = run(root, ['--qa-scope']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout.trim(), [...S.QA_SMOKE, 'UC-AUTH-02'].join(', '));
    });

    test('--qa-report-path печатает путь отчёта задачи ветки', () => {
      const root = makeGitRoot('PASS', { '.ai/memory/tasks.md': wip('- **FE-1 (P1)** a\n  - Кейсы: нет\n') }, 'feature/FE-1-a');
      const r = run(root, ['--qa-report-path']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout.trim(), '.qa/runs/FE-1.md');
    });

    test('отчёт другой задачи или старый .qa/report.md не засчитываются — код 1', () => {
      const root = makeGitRoot('PASS', { '.ai/memory/tasks.md': wip('- **FE-1 (P1)** a\n  - Кейсы: нет\n') }, 'feature/FE-1-a');
      const own = path.join(root, '.qa/runs/FE-1.md');
      const text = fs.readFileSync(own, 'utf8');
      fs.rmSync(own);
      fs.writeFileSync(path.join(root, '.qa/runs/FE-2.md'), text);
      fs.writeFileSync(path.join(root, '.qa/report.md'), text);
      const r = runQa(root);
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /\.qa\/runs\/FE-1\.md/);
    });

    test('отчёта нет — код 1; без флага отчёт не требуется', () => {
      const root = makeGitRoot();
      fs.rmSync(path.join(root, '.qa'), { recursive: true });
      assert.equal(runQa(root).status, 1);
      assert.equal(run(root).status, 0);
    });
  });
});
