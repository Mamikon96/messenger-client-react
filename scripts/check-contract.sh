#!/usr/bin/env bash
# Проверка контракта задач в разделе «В работе» файла tasks.md (.ai/rules/task-contract.md).
# Использование: bash scripts/check-contract.sh [путь к tasks.md]. Код 0 — контракт полный, 1 — неполный контракт, подпункты без заголовка или задача осталась в «Бэклоге», 2 — нет файла.
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
    grep -qE "^[[:space:]]+- (\*\*)?$field:(\*\*)?[[:space:]]*[^[:space:]]" <<<"$block" || missing+=("$field")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    errors=$((errors + 1))
    echo "  ✗ $TASKS: у задачи $id в «В работе» нет или пусто: $(IFS=,; echo "${missing[*]}" | sed 's/,/, /g')"
  fi
done

# Подпункты контракта до первого заголовка задачи — «сироты»
orphans=$(echo "$wip" | awk '/^- \*\*/{exit} /^[[:space:]]+- /{n++} END{print n+0}')
if [ "$orphans" -gt 0 ]; then
  errors=$((errors + 1))
  echo "  ✗ $TASKS: в «В работе» $orphans подпунктов контракта без заголовка задачи «- **FE-NN (P?)** …» над ними"
fi

# Задача из «В работе» не должна оставаться в «Бэклоге»
backlog=$(awk '/^## Бэклог/{f=1;next} /^## /{f=0} f' "$TASKS")
for id in $ids; do
  if grep -qE "^- \*\*$id([^0-9]|$)" <<<"$backlog"; then
    errors=$((errors + 1))
    echo "  ✗ $TASKS: задача $id есть и в «В работе», и в «Бэклоге»"
  fi
done

if [ "$errors" -gt 0 ]; then
  echo "    WHY: без контракта задача уходит в реализацию без согласованной цели, проверки и границ; осиротевший контракт или дубль в «Бэклоге» ведут к потере или двойному взятию задачи."
  echo "    FIX: допиши подпункты «  - <Поле>: …» под заголовком задачи по формату .ai/rules/task-contract.md (открытые вопросы — к пользователю до кода); верни заголовок над подпунктами; убери задачу из «Бэклога»."
  exit 1
fi
exit 0
