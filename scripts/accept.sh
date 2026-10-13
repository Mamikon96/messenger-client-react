#!/usr/bin/env bash
# Приёмка задачи: память + кейсы/API/код + unit + e2e. Задача считается завершённой только при exit code 0.
set -euo pipefail
cd "$(dirname "$0")/.."

# Память и статика — первыми (fail-fast до долгих unit/e2e); в --behavior они не повторяются
bash scripts/check-state.sh

# Статика: ESLint (FE-D24); предупреждения тоже валят приёмку
echo "==> ESLint (src, e2e, scripts, mock-bff)"
npx eslint src e2e scripts mock-bff --max-warnings=0

echo "==> Unit-тесты (Jest)"
CI=true npx react-scripts test --watchAll=false

echo "==> Тесты чекеров, правил ESLint и hook-скриптов (node --test)"
node --test scripts/check-state.test.js scripts/check-contract.test.js scripts/qa-required.test.js scripts/eslint-rules.test.js scripts/check-memory.test.js scripts/accept-stamp.test.js scripts/hooks.test.js scripts/check-fast.test.js scripts/mock-bff-port.test.js

# Прогон e2e + матрица «кейс → результат»: упавший тест = нарушенный user-кейс (docs/user-cases.md)
bash scripts/check-state.sh --behavior --no-precheck

echo "==> Все тесты зелёные"
bash scripts/accept-stamp.sh write
