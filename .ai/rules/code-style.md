# Конвенции кода
Читать: при создании/изменении компонентов, слайсов, стилей.
Источник: FE-D19, FE-D25; ESLint-конфиг в `package.json`. Пересмотреть, когда меняются правила ESLint или соглашения.

- Один компонент = папка с `Name.js` + `Name.css`; папки в kebab-case, файлы — PascalCase.
- Расположение: `src/app/modules/<module>/`, вложенные части — `components/<name>/`.
- Классы по БЭМ: `block__element`, модификаторы с префиксом `_` (`_active`, `_dark`).
- Функциональные компоненты и хуки. Экспорт: файл-компонент (в т. ч. в `components/`) экспортирует свой компонент по `export default`; именованный экспорт — для вспомогательного (селекторы, утилиты, константы, вспомогательные компоненты рядом с основным) (FE-D19).
- Слайсы RTK: `createSlice`, экспорт actions + `default` reducer; регистрация в `src/app/store.js`. Id чатов и сообщений создаёт сервер (UUID, FE-D12); локальные id — `createClientId()` из `src/app/services/clientId.js`; сущности с сервера — `createEntityAdapter` (FE-D15(2)).
- Состояние формы — `useState` + общий `handleChange` по `event.target.name`.
- Стили — обычный CSS, один файл на компонент. JavaScript, без TypeScript.
- Без `console.log` (проверяет ESLint, FE-D25; для ошибок — `console.error`).
- Экономия контекста (FE-141): сначала `git diff --stat`, затем дифф нужных файлов; `grep` с `-m`/`| head`, `sed -n` с узким диапазоном; большие файлы не выводить целиком (`Read` с `offset`/`limit`).
