#!/usr/bin/env bash
# Сводка состояния для hook SessionStart (FE-D27): вывод попадает в контекст новой сессии Claude Code,
# чтобы не читать tasks.md и state.md целиком. Ничего не меняет; всегда код 0, чтобы не ломать старт сессии.
# Использование: bash scripts/session-brief.sh [tasks.md] [state.md]
set -u
cd "$(dirname "$0")/.." 2>/dev/null || exit 0

TASKS=${1:-.ai/memory/tasks.md}
STATE=${2:-.ai/memory/state.md}

# Тело раздела «## <имя>» до следующего заголовка второго уровня, без пустых строк
section() { awk -v h="## $2" '$0 == h {f=1; next} /^## /{f=0} f && NF' "$1"; }

echo "== Сводка проекта (hook SessionStart) =="
branch=$(git branch --show-current 2>/dev/null || echo "?")
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
echo "Ветка: ${branch:-detached}; незакоммиченных файлов: $dirty"

if [ -f "$TASKS" ]; then
  echo "-- В работе ($TASKS) --"
  section "$TASKS" "В работе"
else
  echo "-- нет файла $TASKS --"
fi

if [ -f "$STATE" ]; then
  echo "-- Последняя приёмка ($STATE) --"
  section "$STATE" "Последняя приёмка"
  echo "-- Фокус сейчас --"
  section "$STATE" "Фокус сейчас"
else
  echo "-- нет файла $STATE --"
fi

echo "Подробности — по маршрутизатору CLAUDE.md; бэклог и история в этой сводке не показаны."
exit 0
