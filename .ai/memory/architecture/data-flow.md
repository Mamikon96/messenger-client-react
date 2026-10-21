# Поток данных
> Проверено: 2026-10-21 @ 7cee71f+dirty

`src/index.js` регистрирует `setUnauthorizedHandler(() => store.dispatch(sessionClosed()))` и рендерит `<Provider store>` → `App`: при монтировании `useEffect` диспатчит `checkSession` (cleanup — `abort`, StrictMode зовёт эффект дважды), дальше гейт по `auth.status`: `loading` — «Загрузка…», `anonymous` и `sessionClosed` — `Login` (при `sessionClosed` над формой сообщение «Сессия завершена. Войдите снова.»), `authenticated` — `Header` + `Messenger`, `error` — сообщение и кнопка «Повторить» (повторный `checkSession`).

Прочтение (FE-43): `Dialog` через хук `useReadReceipts` (`modules/messenger/`) спустя 300 мс после сигнала (прокрутка, смена чата, рост `lastSeq`, возврат на вкладку) диспатчит thunk `markChatRead` (`reducers/chats.js`) — `POST /api/chats/:id/read` с max загруженным `seq`, если лента у низа и вкладка видна; `unreadCount` обнуляется на `fulfilled`, только если отправленный `seq` ≥ `lastSeq` чата. `useRealtime` на `focus` и `visibilitychange`→visible диспатчит `reconcileRealtime` (`reducers/realtime.js`) — сверку списка чатов из FE-42 без потери `history`.
