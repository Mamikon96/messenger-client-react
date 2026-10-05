# Конвенции кода
Читать: при создании/изменении компонентов, слайсов, стилей.

- Один компонент = папка с `Name.js` + `Name.css`; папки в kebab-case, файлы — PascalCase.
- Расположение: `src/app/modules/<module>/`, вложенные части — `components/<name>/`.
- Классы по БЭМ: `block__element`, модификаторы с префиксом `_` (`_active`, `_dark`).
- Функциональные компоненты и хуки. Экспорт: `export default` для модулей, именованный для мелких частей в `components/`.
- Слайсы RTK: `createSlice`, id через `nanoid()`, экспорт actions + `default` reducer; регистрация в `src/app/store.js`.
- Состояние формы — `useState` + общий `handleChange` по `event.target.name`.
- Стили — обычный CSS, один файл на компонент. JavaScript, без TypeScript.
- Без `console.log` в коде, который остаётся в проекте.
