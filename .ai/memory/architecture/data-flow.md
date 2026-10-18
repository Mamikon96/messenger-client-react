# Поток данных
> Проверено: 2026-10-17 @ f5bc883+dirty

`src/index.js` регистрирует `setUnauthorizedHandler(() => store.dispatch(sessionClosed()))` и рендерит `<Provider store>` → `App`: при монтировании `useEffect` диспатчит `checkSession` (cleanup — `abort`, StrictMode зовёт эффект дважды), дальше гейт по `auth.status`: `loading` — «Загрузка…», `anonymous` и `sessionClosed` — `Login` (при `sessionClosed` над формой сообщение «Сессия завершена. Войдите снова.»), `authenticated` — `Header` + `Messenger`, `error` — сообщение и кнопка «Повторить» (повторный `checkSession`).
