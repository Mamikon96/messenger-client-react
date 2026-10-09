#!/usr/bin/env bash
# Проверка состояния системы: память + рассинхрон кейсов ↔ API ↔ код ↔ поведение (FE-D16).
#   bash scripts/check-state.sh                  — память + статические проверки (быстро)
#   bash scripts/check-state.sh --behavior       — то же + прогон e2e и матрица «кейс → результат»
#   bash scripts/check-state.sh --require-qa     — то же + свежий отчёт qa-tester с вердиктом PASS (FE-D17)
#   --no-precheck                                — не повторять память и статику перед e2e (для accept.sh: они уже проверены в начале)
#   --require-contract                           — отсутствие docs/client-integration.md считать ошибкой
set -uo pipefail
cd "$(dirname "$0")/.."

behavior=0
precheck=1
pass_args=()
for a in "$@"; do
  case $a in
    --behavior) behavior=1;;
    --no-precheck) precheck=0;;
    --require-qa|--require-contract) pass_args+=("$a");;
    *) echo "неизвестный аргумент: $a" >&2; exit 2;;
  esac
done

if [ "$precheck" -eq 1 ]; then
  bash scripts/check-memory.sh || exit 1
  node scripts/check-state.js "${pass_args[@]}" || exit 1
fi

if [ "$behavior" -eq 1 ]; then
  report=$(mktemp "${TMPDIR:-/tmp}/e2e-report.XXXXXX.json")
  trap 'rm -f "$report"' EXIT
  echo "==> E2E-тесты (Playwright)"
  e2e_rc=0
  CI=true PLAYWRIGHT_JSON_OUTPUT_NAME="$report" npx playwright test --reporter=list,json || e2e_rc=$?
  node scripts/check-state.js --behavior-report "$report" "${pass_args[@]}" || exit 1
  [ "$e2e_rc" -eq 0 ] || { echo "==> E2E красные (код $e2e_rc)"; exit "$e2e_rc"; }
fi
