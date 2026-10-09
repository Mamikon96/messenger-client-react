// Ошибка OAuth приходит редиректом на /?auth_error=<код> (docs/client-integration.md, FE-D06); тексты — FE-D11.
const PARAM = "auth_error";
const GENERIC_MESSAGE = "Не удалось войти";
const MESSAGES = {
    access_denied: "Вход отменён",
    provider_error: "Ошибка провайдера",
    invalid_state: "Попытка входа устарела",
};

// Текст ошибки по строке запроса или null, если параметра нет. Неизвестный и пустой код — общее сообщение.
export function readAuthError(search) {
    const params = new URLSearchParams(search);
    if (!params.has(PARAM)) return null;
    const code = params.get(PARAM);
    // hasOwnProperty.call, а не Object.hasOwn (ES2022): иначе на старых браузерах из browserslist будет TypeError именно в сценарии ошибки
    return Object.prototype.hasOwnProperty.call(MESSAGES, code) ? MESSAGES[code] : GENERIC_MESSAGE;
}

// Убирает параметр из адреса без перезагрузки и записи в историю; путь, остальные параметры и хэш сохраняются.
export function clearAuthErrorFromUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM)) return;
    url.searchParams.delete(PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
