// Адрес WebSocket: в dev — REACT_APP_WS_URL (напрямую на бэкенд, FE-D14), в проде — тот же origin, путь /ws.
export const getWsUrl = (env = process.env, loc = window.location) =>
    env.REACT_APP_WS_URL || `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`
