#!/usr/bin/env bash
# Утверждение набора user-кейсов (индекс docs/user-cases.md и файлы docs/user-cases/*.md): записывает хэш набора в .ai/user-cases.sha256.
# Запускает ТОЛЬКО пользователь (в сессии Claude Code: `! bash scripts/approve-usecases.sh --yes`); агентам запрещено (.claude/settings.json).
# Без --yes спрашивает подтверждение; без терминала (например, через `!` в Claude Code) без --yes завершается ошибкой.
set -euo pipefail
cd "$(dirname "$0")/.."

node -e '
const fs = require("fs");
const S = require("./scripts/check-state.js");
const { cases, errors } = S.loadCaseSet(".");
if (errors.length) { console.error(errors.map((e) => "  ✗ " + e).join("\n")); process.exit(1); }
const n = (st) => cases.filter((c) => c.status === st).length;
console.log("Кейсов: " + cases.length + " (active " + n("active") + ", planned " + n("planned") + ")");
'

if [ "${1:-}" != "--yes" ]; then
  if [ ! -t 0 ]; then
    echo "Ошибка: stdin не терминал, подтвердить нельзя. Запусти с --yes: bash scripts/approve-usecases.sh --yes" >&2
    exit 1
  fi
  read -r -p "Утвердить набор user-кейсов (docs/user-cases.md и docs/user-cases/) в текущем виде? [y/N] " ans
  [ "$ans" = "y" ] || { echo "Отменено"; exit 1; }
fi

node -e '
const fs = require("fs");
const S = require("./scripts/check-state.js");
fs.mkdirSync(".ai", { recursive: true });
fs.writeFileSync(".ai/user-cases.sha256", S.hashText(S.casesBundle(".").text) + "\n");
'
echo "==> Утверждено: .ai/user-cases.sha256 обновлён (закоммитьте вместе с docs/user-cases.md и docs/user-cases/)"
