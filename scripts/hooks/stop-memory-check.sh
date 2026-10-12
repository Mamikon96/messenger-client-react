#!/usr/bin/env bash
# Hook Stop (FE-D27): перед завершением ответа память должна быть актуальна (неснимаемое правило 1 в CLAUDE.md).
# Код 2 возвращает агента к работе, stderr — ему как объяснение. Повторная остановка после возврата
# (stop_hook_active) пропускается, чтобы не зациклиться. Проверка подменяется через STOP_HOOK_CHECK (тесты).
set -u
cd "$(dirname "$0")/../.." || exit 0

input=$(cat 2>/dev/null || true)
if printf '%s' "$input" | grep -qE '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

out=$(bash -c "${STOP_HOOK_CHECK:-bash scripts/check-memory.sh}" 2>&1) && exit 0

{
  echo "$out" | grep -E '✗' || echo "$out"
  echo "Почему: после любых изменений память обновляется до ответа пользователю (CLAUDE.md, правило 1; .ai/rules/memory-protocol.md)."
  echo "Как исправить: обнови «Осталось» задачи в .ai/memory/tasks.md (и state.md, если нужно), штамп «Проверено», затем bash scripts/check-memory.sh = 0."
} >&2
exit 2
