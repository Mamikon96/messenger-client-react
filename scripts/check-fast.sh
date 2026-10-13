#!/usr/bin/env bash
# Лёгкие проверки цикла разработки (FE-D35): только затронутые изменениями ветки. Не приёмка — полная регрессия в npm run accept.
#   bash scripts/check-fast.sh            — прогнать
#   bash scripts/check-fast.sh --dry-run  — только показать, что будет запущено
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/check-fast.js "$@"
