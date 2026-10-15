#!/usr/bin/env bash
# Hook контекста (FE-105, FE-D41): порог контекста — абсолютный, по модели:
# Sonnet и Haiku — 90K токенов, Opus и прочие/неизвестные — 150K (единственная таблица — функция limitFor ниже).
# Читается хвост транскрипта (~256 КБ), при отсутствии замера в нём — весь файл; записи <synthetic> и с нулевым usage пропускаются.
# Размер контекста — из последнего ответа ассистента: input + cache_read + cache_creation.
# - Stop (основная сессия): транскрипт transcript_path, записи основной ветки (не isSidechain). Код 2 возвращает
#   агента к работе: сохранить состояние в память и остановиться. Повторная остановка (stop_hook_active) — код 0.
# - PostToolUse (субагент): работает только при agent_id; транскрипт — agent_transcript_path или
#   <transcript_path без .jsonl>/subagents/agent-<agent_id>.jsonl (там все записи isSidechain). При превышении
#   stdout JSON {"decision":"block","reason":...}, код 0. Основную сессию не трогает (её ловит Stop).
# Нет транскрипта, ниже порога или битый stdin — молча код 0.
set -u

input=$(cat 2>/dev/null || true)
if printf '%s' "$input" | grep -qE '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi
# PostToolUse срабатывает после каждого инструмента: основная сессия (нет agent_id) не нужна, node не запускаем
if printf '%s' "$input" | grep -q '"hook_event_name"[[:space:]]*:[[:space:]]*"PostToolUse"' &&
  ! printf '%s' "$input" | grep -q '"agent_id"'; then
  exit 0
fi

result=$(printf '%s' "$input" | node -e '
const fs = require("node:fs");
const limitFor = (model) => (/sonnet|haiku/i.test(model) ? 90000 : 150000);
let data;
try { data = JSON.parse(fs.readFileSync(0, "utf8")); } catch { process.exit(0); }
const sub = data.hook_event_name === "PostToolUse";
let path = data.transcript_path;
if (sub) {
  if (!data.agent_id) process.exit(0);
  path = data.agent_transcript_path ||
    (path && path.replace(/\.jsonl$/, "") + "/subagents/agent-" + data.agent_id + ".jsonl");
}
if (!path) process.exit(0);
const TAIL = 256 * 1024;
const readTail = () => {
  const fd = fs.openSync(path, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - TAIL);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString("utf8").split("\n");
    return start > 0 ? lines.slice(1) : lines;
  } finally { fs.closeSync(fd); }
};
const measure = (lines) => {
  let found = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const m = e && e.message;
    const u = m && m.usage;
    if (!e || e.type !== "assistant" || !(sub || !e.isSidechain) || !u || m.model === "<synthetic>") continue;
    const used = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    if (used > 0) found = { used, model: m.model || "" };
  }
  return found;
};
let found;
try {
  found = measure(readTail());
  if (!found) found = measure(fs.readFileSync(path, "utf8").split("\n"));
} catch { process.exit(0); }
if (!found) process.exit(0);
const { used, model } = found;
const limit = limitFor(model);
if (used >= limit) console.log([sub ? "sub" : "main", used, model || "неизвестна", limit / 1000].join(" "));
' 2>/dev/null || true)

[ -n "$result" ] || exit 0
read -r kind used model limit <<<"$result"

if [ "$kind" = "sub" ]; then
  reason="Контекст субагента: $used токенов, модель $model, порог ${limit}K (Sonnet/Haiku 90K, Opus и прочие 150K; FE-D41). Сохрани состояние и заверши работу: если можешь править файлы — допиши «Осталось» задачи в .ai/memory/tasks.md и прогони bash scripts/check-memory.sh; иначе — верни в отчёте, что сделано и что осталось. Дальнейшую работу не продолжай."
  REASON="$reason" node -e 'console.log(JSON.stringify({ decision: "block", reason: process.env.REASON }))'
  exit 0
fi

{
  echo "Контекст сессии: $used токенов, модель $model, порог ${limit}K (Sonnet/Haiku 90K, Opus и прочие 150K; FE-D41)."
  echo "Что сделать: допиши «Осталось» задачи в .ai/memory/tasks.md (и state.md, если нужно), штамп «Проверено», bash scripts/check-memory.sh = 0, сообщи пользователю, что сессию надо закрыть (/clear) и продолжить в новой."
} >&2
exit 2
