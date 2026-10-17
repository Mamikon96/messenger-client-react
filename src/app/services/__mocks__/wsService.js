// Ручной мок для тестов, которые рендерят мессенджер: сокет не открывается, сеть не нужна.
// Обычные функции, а не jest.fn: resetMocks в конфиге CRA сбросил бы их реализацию.
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 30000;
export const createWsService = () => ({ connect() {}, close() {} });
