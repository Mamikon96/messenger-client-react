#!/usr/bin/env bash
# Утверждение документа user-кейсов: записывает его хэш в .ai/user-cases.sha256.
# Запускает ТОЛЬКО пользователь (в сессии Claude Code: `! bash scripts/approve-usecases.sh`); агентам запрещено (.claude/settings.json).
# Без --yes спрашивает подтверждение.
set -euo pipefail
cd "$(dirname "$0")/.."

node -e '
const fs = require("fs");
const S = require("./scripts/check-state.js");
const { cases, errors } = S.parseCases(fs.readFileSync("docs/user-cases.md", "utf8"));
if (errors.length) { console.error(errors.map((e) => "  ✗ " + e).join("\n")); process.exit(1); }
const n = (st) => cases.filter((c) => c.status === st).length;
console.log("Кейсов: " + cases.length + " (active " + n("active") + ", planned " + n("planned") + ")");
'

if [ "${1:-}" != "--yes" ]; then
  read -r -p "Утвердить docs/user-cases.md в текущем виде? [y/N] " ans
  [ "$ans" = "y" ] || { echo "Отменено"; exit 1; }
fi

node -e '
const fs = require("fs");
const S = require("./scripts/check-state.js");
fs.mkdirSync(".ai", { recursive: true });
fs.writeFileSync(".ai/user-cases.sha256", S.hashText(fs.readFileSync("docs/user-cases.md", "utf8")) + "\n");
'
echo "==> Утверждено: .ai/user-cases.sha256 обновлён (закоммитьте вместе с docs/user-cases.md)"
