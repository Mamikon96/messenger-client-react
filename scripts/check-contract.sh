#!/usr/bin/env bash
# Проверка контракта задач в разделе «В работе» файла tasks.md (.ai/rules/task-contract.md).
# Использование: bash scripts/check-contract.sh [путь к tasks.md]. Код 0 — контракт полный, 1 — нет полей, 2 — нет файла.
set -uo pipefail

TASKS=${1:-.ai/memory/tasks.md}
[ -f "$TASKS" ] || { echo "  ✗ нет файла $TASKS"; exit 2; }

FIELDS=("Цель" "Кейсы" "Проверка задачи" "В скоупе" "Вне скоупа" "Открытые вопросы" "Осталось")
errors=0

# Блоки задач «В работе»: от строки «- **ID» до следующей такой строки или конца раздела
wip=$(awk '/^## В работе/{f=1;next} /^## /{f=0} f' "$TASKS")
ids=$(echo "$wip" | grep -oE '^- \*\*[A-Z]+-[0-9]+' | sed 's/^- \*\*//')

for id in $ids; do
  block=$(echo "$wip" | awk -v id="$id" '
    /^- \*\*/ { f = (index($0, "- **" id) == 1) ? 1 : 0 }
    f')
  missing=()
  for field in "${FIELDS[@]}"; do
    echo "$block" | grep -qE "^[[:space:]]+- (\*\*)?$field:(\*\*)?[[:space:]]*[^[:space:]]" || missing+=("$field")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    errors=$((errors + 1))
    echo "  ✗ $TASKS: у задачи $id в «В работе» нет или пусто: $(IFS=,; echo "${missing[*]}" | sed 's/,/, /g')"
  fi
done

if [ "$errors" -gt 0 ]; then
  echo "    WHY: без контракта задача уходит в реализацию без согласованной цели, проверки и границ — расхождение всплывает только на ревью/QA."
  echo "    FIX: допиши подпункты «  - <Поле>: …» под задачей по формату .ai/rules/task-contract.md; открытые вопросы — к пользователю до кода."
  exit 1
fi
exit 0
