#!/usr/bin/env bash
# Штамп зелёной приёмки (FE-D27): хэш проверяемых приёмкой файлов, включая незакоммиченные.
#   write — записать .qa/accept.json (вызывает scripts/accept.sh после успешного прогона)
#   check — код 0, если штамп есть и совпадает с текущими файлами; 1 — нет штампа или он устарел
# Ревьюер по совпадающему штампу не перезапускает приёмку. Память (.ai/) в хэш не входит: её правка результат приёмки не меняет.
# STAMP_ROOT — корень репозитория (для тестов).
set -uo pipefail
ROOT=${STAMP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
STAMP="$ROOT/.qa/accept.json"
PATHS=(src e2e mock-bff scripts package.json playwright.config.js docs/user-cases.md)

tree_hash() {
  local tmp existing=()
  tmp=$(mktemp -d)
  for p in "${PATHS[@]}"; do [ -e "$ROOT/$p" ] && existing+=("$p"); done
  # Отдельный индекс: рабочее дерево как есть, с неотслеживаемыми файлами; основной индекс не трогается
  GIT_INDEX_FILE="$tmp/index" git -C "$ROOT" add -A -- "${existing[@]}" >/dev/null 2>&1
  GIT_INDEX_FILE="$tmp/index" git -C "$ROOT" write-tree
  rm -rf "$tmp"
}

case "${1:-}" in
  write)
    mkdir -p "$ROOT/.qa"
    printf '{\n  "treeHash": "%s",\n  "date": "%s",\n  "head": "%s"\n}\n' \
      "$(tree_hash)" "$(date '+%F %T')" "$(git -C "$ROOT" rev-parse --short HEAD)" > "$STAMP"
    echo "==> Штамп приёмки: $STAMP"
    ;;
  check)
    [ -f "$STAMP" ] || { echo "нет штампа приёмки ($STAMP) — запусти npm run accept"; exit 1; }
    saved=$(grep -oE '"treeHash": "[0-9a-f]+"' "$STAMP" | grep -oE '[0-9a-f]{40}')
    if [ "$saved" = "$(tree_hash)" ]; then
      echo "штамп приёмки действителен: $(grep -oE '"date": "[^"]+"' "$STAMP")"
      exit 0
    fi
    echo "штамп приёмки устарел: проверяемые файлы изменились после прогона — запусти npm run accept"
    exit 1
    ;;
  *)
    echo "использование: bash scripts/accept-stamp.sh write|check" >&2
    exit 2
    ;;
esac
