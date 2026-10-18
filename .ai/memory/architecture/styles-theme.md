# Стили и темы
> Проверено: 2026-10-17 @ f5bc883+dirty

## Стили и темы
- Дизайн-токены (FE-D07) — `src/styles/tokens.css` (CSS custom properties: цвета, типографика, отступы, радиусы, тени, анимации), подключены первым импортом в `src/index.js`. Светлая тема в `:root`, тёмная в `[data-theme="dark"]` (атрибут на `<html>`, переключение — `src/app/modules/theme/`). Компоненты пока используют старые литеральные цвета; миграция на токены — FE-24…FE-29.

## Тема (FE-23, FE-D08)
- `src/app/modules/theme/theme.js` — внешнее хранилище вне Redux: режим `light`/`dark`/`system`, применённая тема, `initTheme()` (вызывается в `src/index.js` до рендера: читает localStorage `theme`, слушает `prefers-color-scheme`), `setMode`, `subscribe`/`getSnapshot`; хук `useTheme()` (`useSyncExternalStore`) отдаёт `{ mode, theme, setMode }` любому компоненту без провайдера.
- Тема ставится атрибутом `data-theme` на `<html>`. До загрузки React её выставляет инлайн-скрипт в `public/index.html` (та же логика, без вспышки). Выбор хранится в localStorage (сбой доступа — try/catch) и при logout не сбрасывается.
- UI переключателя — `ThemeSwitch` в `UserMenu` (FE-28).
