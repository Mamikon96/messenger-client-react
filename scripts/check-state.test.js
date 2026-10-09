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
      rows: [['UC-A-01', 'pass'], ['UC-A-02', 'pass']],
      problems: [],
      ...over,
    };
    const lines = ['# QA-отчёт', ''];
    if (f.tree !== null) lines.push(`Дерево: ${f.tree}`);
    if (f.hash !== null) lines.push(`Кейсы: ${f.hash}`);
    if (f.verdict !== null) lines.push(`Вердикт: ${f.verdict}`);
    lines.push('', '## Матрица', '| Кейс | Результат | Комментарий |', '|---|---|---|');
    for (const [id, st] of f.rows) lines.push(`| ${id} | ${st} | — |`);
    lines.push('', '## Проблемы');
    for (const pr of f.problems) lines.push(`### ${pr}`, 'Шаги: 1. …');
    return lines.join('\n');
  };
  const ctx = (over = {}) => ({ casesHash: HASH, activeIds: ['UC-A-01', 'UC-A-02'], treeHash: 'tree1234', ...over });

  test('свежий отчёт PASS по всем active-кейсам — без ошибок', () => {
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

  test('active-кейса нет в матрице — ошибка', () => {
    const errors = S.checkQaReport(report({ rows: [['UC-A-01', 'pass']] }), ctx());
    assert.ok(errors.some((e) => e.includes('UC-A-02')));
  });

  test('кейс не pass в матрице — ошибка', () => {
    const errors = S.checkQaReport(report({ rows: [['UC-A-01', 'pass'], ['UC-A-02', 'fail']] }), ctx());
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

test.describe('CLI на фикстурном репозитории', () => {
  const cli = path.join(__dirname, 'check-state.js');
  const goodCases = doc(
    caseBlock({ api: ['GET /api/auth/session'] }),
    caseBlock({ id: 'UC-AUTH-02', status: 'planned', api: [] })
  );
  const goodSpec =
    "const { test, expect } = require('@playwright/test');\n" +
    "test('[UC-AUTH-01] вход', async () => { expect(1).toBe(1); });\n";

  const makeRoot = (over = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-state-'));
    const files = {
      'docs/user-cases.md': goodCases,
      '.ai/user-cases.sha256': S.hashText(goodCases) + '\n',
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
  const run = (root, args = []) =>
    spawnSync(process.execPath, [cli, '--root', root, ...args], { encoding: 'utf8' });

  test('согласованное состояние — код 0', () => {
    const r = run(makeRoot());
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  test('правка документа без утверждения — код 1', () => {
    const r = run(makeRoot({ 'docs/user-cases.md': goodCases + '\nправка\n' }));
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /approve-usecases\.sh/);
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

  test.describe('--require-qa', () => {
    const { execFileSync } = require('node:child_process');
    const git = (root, ...a) =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: root, encoding: 'utf8' }).trim();
    const qaReport = (tree, hash, verdict = 'PASS') =>
      `# QA-отчёт\n\nДерево: ${tree}\nКейсы: ${hash}\nВердикт: ${verdict}\n\n## Матрица\n| Кейс | Результат | Комментарий |\n|---|---|---|\n| UC-AUTH-01 | pass | — |\n\n## Проблемы\n`;

    const treeOf = (root) => run(root, ['--tree-hash']).stdout.trim();
    const makeGitRoot = (verdict) => {
      const root = makeRoot();
      git(root, 'init', '-q');
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'init');
      fs.mkdirSync(path.join(root, '.qa'), { recursive: true });
      fs.writeFileSync(path.join(root, '.qa/report.md'), qaReport(treeOf(root), S.hashText(goodCases), verdict));
      return root;
    };

    test('свежий отчёт PASS — код 0', () => {
      const r = run(makeGitRoot('PASS'), ['--require-qa']);
      assert.equal(r.status, 0, r.stdout + r.stderr);
    });

    test('отчёт с вердиктом FAIL — код 1', () => {
      const r = run(makeGitRoot('FAIL'), ['--require-qa']);
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /Вердикт/);
    });

    test('правка кода после отчёта (в рабочем дереве) — код 1', () => {
      const root = makeGitRoot('PASS');
      fs.appendFileSync(path.join(root, 'src/app/api.js'), '// правка\n');
      const r = run(root, ['--require-qa']);
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /устар/);
    });

    test('хэш дерева не зависит от незакоммиченности: коммит без правок не делает отчёт устаревшим', () => {
      const root = makeGitRoot('PASS');
      fs.appendFileSync(path.join(root, 'src/app/api.js'), '// правка\n');
      fs.writeFileSync(path.join(root, '.qa/report.md'), qaReport(treeOf(root), S.hashText(goodCases)));
      assert.equal(run(root, ['--require-qa']).status, 0);
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'task');
      assert.equal(run(root, ['--require-qa']).status, 0);
    });

    test('новый неотслеживаемый файл в src после отчёта — код 1', () => {
      const root = makeGitRoot('PASS');
      fs.writeFileSync(path.join(root, 'src/app/new.js'), 'export {};\n');
      assert.equal(run(root, ['--require-qa']).status, 1);
    });

    test('отчёта нет — код 1; без флага отчёт не требуется', () => {
      const root = makeGitRoot('PASS');
      fs.rmSync(path.join(root, '.qa'), { recursive: true });
      assert.equal(run(root, ['--require-qa']).status, 1);
      assert.equal(run(root).status, 0);
    });
  });
});
