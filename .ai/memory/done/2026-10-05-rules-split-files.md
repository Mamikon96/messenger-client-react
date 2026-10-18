# 2026-10-05-rules-split-files

- 2026-10-05 — Контекст AI разложен по файлам: правила вынесены из `CLAUDE.md` в `.ai/rules/` (code-style, testing, tech-approval, acceptance, memory-protocol, report-format), добавлен маршрутизатор `.ai/README.md`, `CLAUDE.md` сжат до индекса, в `.ai/memory/README.md` добавлена колонка «когда читать»; `scripts/check-memory.sh` проверяет ссылки также в `CLAUDE.md` и `.ai/rules` (приёмка: `npm run accept` ✓; ревью не требуется — изменены только документация/процесс; решение FE-D03)
