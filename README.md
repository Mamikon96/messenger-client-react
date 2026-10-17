# messenger-client-react

## Запуск с реальным бэкендом

1. Запустите бэкенд (`messenger-server`) на порту 3333: HTTP `http://localhost:3333`, WebSocket `ws://localhost:3333/ws`.
2. В `ALLOWED_ORIGINS` бэкенда добавьте origin dev-сервера: `http://localhost:3000` и `http://localhost:3100`.
3. Скопируйте `.env.example` в `.env.development.local` (файл не коммитится):
   - `BACKEND_URL` — куда dev-сервер проксирует `/api` (по умолчанию `http://localhost:3333`);
   - `REACT_APP_WS_URL` — адрес WebSocket (`ws://localhost:3333/ws`). Клиент подключается к бэкенду напрямую, а не через dev-сервер: путь `/ws` занят HMR dev-сервера. В проде переменная не нужна, адрес строится как `ws(s)://<host>/ws`.
4. `npm start`.

Работа с mock-BFF (порт 3334): `BACKEND_URL=http://localhost:3334 npm start`.
