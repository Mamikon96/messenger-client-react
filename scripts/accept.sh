#!/usr/bin/env bash
# Приёмка задачи: unit + e2e. Задача считается завершённой только при exit code 0.
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/check-memory.sh

echo "==> Unit-тесты (Jest)"
CI=true npx react-scripts test --watchAll=false

echo "==> E2E-тесты (Playwright)"
CI=true npx playwright test

echo "==> Все тесты зелёные"
