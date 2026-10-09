#!/usr/bin/env bash
# Приёмка задачи: память + кейсы/API/код + unit + e2e. Задача считается завершённой только при exit code 0.
set -euo pipefail
cd "$(dirname "$0")/.."

# Память и статика — первыми (fail-fast до долгих unit/e2e); в --behavior они не повторяются
bash scripts/check-state.sh

echo "==> Unit-тесты (Jest)"
CI=true npx react-scripts test --watchAll=false

echo "==> Тесты чекера состояния (node --test)"
node --test scripts/check-state.test.js

# Прогон e2e + матрица «кейс → результат»: упавший тест = нарушенный user-кейс (docs/user-cases.md)
bash scripts/check-state.sh --behavior --no-precheck

echo "==> Все тесты зелёные"
