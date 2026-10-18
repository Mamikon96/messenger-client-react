#!/usr/bin/env node
// Лёгкие проверки цикла разработки (FE-D35): только то, что затронуто изменениями ветки, от дешёвого к дорогому, остановка на первом красном.
// Изменения — относительно точки ответвления от develop (main, если develop нет), включая незакоммиченные и неотслеживаемые файлы.
// Это не приёмка: штамп не пишет, полную регрессию даёт npm run accept. Логика выбора — чистая функция planChecks (тесты: scripts/check-fast.test.js).
//   node scripts/check-fast.js [--dry-run]   (обычно через bash scripts/check-fast.sh)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { loadCaseSet, currentBranch, taskIdFromBranch, taskCaseIds, readDoneFile } = require('./check-state.js');

const LINT_RE = /^(src|e2e|scripts|mock-bff)\/.*\.js$/;
const MOCK_BFF_SPECS = ['e2e/mock-bff.contract.spec.js', 'e2e/mock-bff-proxy.spec.js'];
const CI = { CI: 'true' };

// Тесты scripts/, которые проверяют изменённый файл: сам тест, scripts/<имя>.test.js, hooks.test.js для scripts/hooks/, eslint-rules.test.js для package.json
function scriptTests(changed, exists) {
  const tests = [];
  for (const f of changed) {
    if (/^scripts\/[^/]+\.test\.js$/.test(f)) tests.push(f);
    else if (/^scripts\/hooks\//.test(f)) tests.push('scripts/hooks.test.js');
    else if (/^scripts\/[^/]+\.(js|sh)$/.test(f)) tests.push(f.replace(/\.(js|sh)$/, '.test.js'));
    else if (f === 'package.json') tests.push('scripts/eslint-rules.test.js');
  }
  return [...new Set(tests)].filter(exists);
}

// Active-кейсы набора user-кейсов (индекс + файлы docs/user-cases/)
function activeCaseIds(root) {
  return new Set(loadCaseSet(root).cases.filter((c) => c.status === 'active').map((c) => c.id));
}

function planChecks({ changed, contractCases, exists }) {
  // Контракт, а не вся память: в цикле код всегда свежее tasks.md, память проверяют hook Stop и npm run accept
  const plan = [{ name: 'контракт', cmd: ['bash', 'scripts/check-contract.sh'] }];

  // Удалённые файлы ESLint (NoFilesFoundError) и Jest не передаются
  const lint = changed.filter((f) => LINT_RE.test(f) && exists(f));
  if (lint.length) plan.push({ name: 'ESLint', cmd: ['npx', 'eslint', '--max-warnings=0', ...lint] });

  const unit = changed.filter((f) => /^src\/.*\.js$/.test(f) && exists(f));
  if (unit.length) {
    plan.push({
      name: 'unit',
      cmd: ['npx', 'react-scripts', 'test', '--watchAll=false', '--passWithNoTests', '--findRelatedTests', ...unit],
      env: CI,
    });
  }

  const scripts = scriptTests(changed, exists);
  if (scripts.length) plan.push({ name: 'тесты scripts', cmd: ['node', '--test', ...scripts] });

  // Общий файл e2e (хелпер, фикстура) может затронуть любой спек — выборочный прогон тут ненадёжен
  if (changed.some((f) => /^e2e\//.test(f) && !/\.spec\.js$/.test(f))) {
    plan.push({ name: 'e2e: все (изменён общий файл e2e)', cmd: ['npx', 'playwright', 'test'], env: CI });
    return plan;
  }
  if (contractCases.length) {
    plan.push({ name: 'e2e: кейсы контракта', cmd: ['npx', 'playwright', 'test', '-g', `\\[(${contractCases.join('|')})\\]`], env: CI });
  }
  const specs = [
    ...changed.filter((f) => /^e2e\/.*\.spec\.js$/.test(f)),
    ...(changed.some((f) => /^mock-bff\//.test(f)) ? MOCK_BFF_SPECS : []),
  ];
  const liveSpecs = [...new Set(specs)].filter(exists);
  if (liveSpecs.length) plan.push({ name: 'e2e: изменённые спеки', cmd: ['npx', 'playwright', 'test', ...liveSpecs], env: CI });
  return plan;
}

// ---------- CLI ----------

// Вывод git с -z: пути без экранирования core.quotePath (не-ASCII, кавычки)
const splitZ = (out) => out.split('\0').filter(Boolean);

function changedFiles(root) {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let base = null;
  for (const ref of ['develop', 'origin/develop', 'main']) {
    try {
      base = git('merge-base', 'HEAD', ref);
      break;
    } catch {
      // ветки нет — пробуем следующую
    }
  }
  if (!base) return null;
  return [...new Set([...splitZ(git('diff', '--name-only', '-z', base)), ...splitZ(git('ls-files', '--others', '--exclude-standard', '-z'))])];
}

function main(argv) {
  const root = path.resolve(__dirname, '..');
  const dryRun = argv.includes('--dry-run');
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  const read = (rel) => (exists(rel) ? fs.readFileSync(path.join(root, rel), 'utf8') : null);
  const changed = changedFiles(root);
  if (!changed) {
    console.log('==> Не найдена база сравнения (develop, origin/develop, main): выбрать изменения нельзя — запусти npm run accept');
    return 2;
  }
  // Кейсы контракта задачи ветки, только active: у удаляемых и planned кейсов нет e2e, grep дал бы «No tests found»
  const taskId = taskIdFromBranch(currentBranch(root));
  const contract = taskCaseIds({ tasksMd: read('.ai/memory/tasks.md'), doneMd: readDoneFile(root, taskId), taskId });
  for (const e of contract.errors) console.log(`  ⚠ ${e}`);
  const active = activeCaseIds(root);
  const plan = planChecks({ changed, contractCases: contract.ids.filter((id) => active.has(id)), exists });

  console.log(`==> Лёгкие проверки по изменениям ветки (${plan.length})`);
  for (const step of plan) {
    const env = step.env ? Object.entries(step.env).map(([k, v]) => `${k}=${v} `).join('') : '';
    console.log(`==> ${step.name}: ${env}${step.cmd.join(' ')}`);
    if (dryRun) continue;
    const r = spawnSync(step.cmd[0], step.cmd.slice(1), { cwd: root, stdio: 'inherit', env: { ...process.env, ...step.env } });
    if (r.status !== 0) {
      console.log(`==> Красное: ${step.name} (код ${r.status}). Почини и перезапусти; npm run accept — только когда лёгкие проверки зелёные`);
      return r.status || 1;
    }
  }
  if (!dryRun) console.log('==> Лёгкие проверки зелёные — дальше npm run accept');
  return 0;
}

module.exports = { planChecks, activeCaseIds, scriptTests, splitZ };

if (require.main === module) process.exit(main(process.argv.slice(2)));
