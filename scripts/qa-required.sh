#!/usr/bin/env bash
# Нужен ли проход qa-tester для коммита этих файлов (FE-D17, FE-D29).
# Код 0 — нужен: среди файлов есть код или стили приложения в src/ или mock-bff/.
# Код 1 — не нужен: только тесты (*.test.js, setupTests.js) или файлы вне src/ и mock-bff/ — поведение приложения не меняется.
# Использование: bash scripts/qa-required.sh <файл>...
set -uo pipefail
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)

# Пути — к виду от корня репозитория (./src/x, абсолютный путь, a/../src/x); realpath -m работает и для удалённых/новых файлов
rel=$(realpath -m --relative-to="$root" -- "$@")
src=$(grep -E '^(src|mock-bff)(/|$)' <<<"$rel" | grep -vE '(\.test\.js|(^|/)setupTests\.js)$' || true)
[ -n "$src" ] && exit 0
exit 1
