// Тесты проверки контракта задач в «В работе» (node --test). Пишутся до реализации scripts/check-contract.sh.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'check-contract.sh');

const contract = (over = {}) => {
  const f = {
    'Цель': 'пользователь видит список чатов',
    'Кейсы': 'UC-CHAT-02',
    'Проверка задачи': 'npx playwright test e2e/chats.spec.js',
    'В скоупе': 'модуль messenger',
    'Вне скоупа': 'стили диалога',
    'Открытые вопросы': 'нет',
    'Осталось': 'реализация',
    ...over,
  };
  return Object.entries(f)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n');
};

const tasks = (wip) =>
  `# Задачи\n> Проверено: 2026-10-12 @ abc1234\n\n## В работе\n${wip}\n\n## Бэклог\n- **FE-90 (P3)** без контракта\n\n## Сделано\n- 2026-10-01 — что-то\n`;

const run = (content) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-'));
  const file = path.join(dir, 'tasks.md');
  fs.writeFileSync(file, content);
  const r = spawnSync('bash', [SCRIPT, file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr };
};

test('пустая «В работе» — код 0', () => {
  assert.equal(run(tasks('—')).code, 0);
});

test('задача с полным контрактом — код 0', () => {
  assert.equal(run(tasks(`- **FE-51 (P1)** Процесс\n${contract()}`)).code, 0);
});

test('задачи бэклога контракт не требуют', () => {
  assert.equal(run(tasks('—')).code, 0);
});

for (const field of ['Цель', 'Кейсы', 'Проверка задачи', 'В скоупе', 'Вне скоупа', 'Открытые вопросы', 'Осталось']) {
  test(`нет поля «${field}» — код 1, в выводе ID задачи и поле`, () => {
    const r = run(tasks(`- **FE-51 (P1)** Процесс\n${contract({ [field]: null })}`));
    assert.equal(r.code, 1);
    assert.match(r.out, /FE-51/);
    assert.match(r.out, new RegExp(field));
  });
}

test('пустое значение поля — код 1', () => {
  const r = run(tasks(`- **FE-51 (P1)** Процесс\n${contract({ 'Проверка задачи': '' })}`));
  assert.equal(r.code, 1);
  assert.match(r.out, /Проверка задачи/);
});

test('контракт проверяется у каждой задачи отдельно', () => {
  const wip = `- **FE-51 (P1)** Первая\n${contract()}\n- **FE-52 (P2)** Вторая\n${contract({ 'Вне скоупа': null })}`;
  const r = run(tasks(wip));
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-52/);
  assert.doesNotMatch(r.out, /FE-51/);
});

test('сообщение об ошибке подсказывает, где формат (WHY/FIX)', () => {
  const r = run(tasks(`- **FE-51 (P1)** Процесс\n${contract({ 'Цель': null })}`));
  assert.match(r.out, /task-contract\.md/);
});

test('сиротские подпункты без заголовка задачи — код 1', () => {
  const r = run(tasks(contract()));
  assert.equal(r.code, 1);
  assert.match(r.out, /без заголовка/);
  assert.match(r.out, /WHY/);
  assert.match(r.out, /FIX/);
});

test('сиротские подпункты после «—» (заголовок удалён) — код 1', () => {
  assert.equal(run(tasks(`—\n${contract()}`)).code, 1);
});

test('задача и в «В работе», и в «Бэклоге» — код 1, в выводе ID', () => {
  const content = tasks(`- **FE-51 (P1)** Процесс\n${contract()}`).replace(
    '- **FE-90 (P3)** без контракта',
    '- **FE-90 (P3)** без контракта\n- **FE-51 (P1)** Процесс (дубль)',
  );
  const r = run(content);
  assert.equal(r.code, 1);
  assert.match(r.out, /FE-51/);
  assert.match(r.out, /FE-51 есть и в «В работе», и в «Бэклоге»/);
  assert.match(r.out, /WHY/);
  assert.match(r.out, /FIX/);
});

test('ID с общим префиксом (FE-5 и FE-51) не считается дублем', () => {
  const content = tasks(`- **FE-5 (P1)** Процесс\n${contract()}`).replace(
    '- **FE-90 (P3)** без контракта',
    '- **FE-51 (P3)** другая',
  );
  assert.equal(run(content).code, 0);
});

test('нет файла — код 2', () => {
  const r = spawnSync('bash', [SCRIPT, '/nonexistent/tasks.md'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
