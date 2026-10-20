import { apiRequest, setCsrfToken, ApiError } from "./apiClient";

const isNonEmptyString = (value) => typeof value === "string" && value !== "";

// Сырой user ответа → клиентская модель SessionUser (docs/client-integration.md §2.3 и §4, SessionUser).
// Обязательны все шесть полей; lastName и avatarUrl могут быть "". Лишние поля сервера отбрасываются. Некорректный user — null.
function toSessionUser(raw) {
    if (typeof raw !== "object" || raw === null) {
        return null;
    }
    const { id, login, firstName, lastName, name, avatarUrl } = raw;
    const valid =
        [id, login, firstName, name].every(isNonEmptyString) && [lastName, avatarUrl].every((value) => typeof value === "string");
    return valid ? { id, login, firstName, lastName, name, avatarUrl } : null;
}

// Тело как у GET /api/auth/session: { user, csrfToken }. Токен отдаётся apiClient, наружу — SessionUser.
function acceptSession(data, endpoint) {
    const user = toSessionUser(data?.user);
    if (!user || !isNonEmptyString(data.csrfToken)) {
        throw new Error(`Некорректный ответ ${endpoint}`);
    }
    setCsrfToken(data.csrfToken);
    return user;
}

// Возвращает user, либо null, если сессии нет (401). Остальные сбои — исключение.
export async function fetchSession({ signal } = {}) {
    let data;
    try {
        // 401 здесь — штатный ответ «не вошли», а не «сессия истекла»
        data = await apiRequest("/api/auth/session", { signal, skipUnauthorizedHandler: true });
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            setCsrfToken(null);
            return null;
        }
        throw error;
    }
    return acceptSession(data, "GET /api/auth/session");
}

// Вход и регистрация сразу отдают сессию: повторный GET /api/auth/session не нужен.
// 401 здесь — неверные данные формы, а не закрытая сессия, поэтому хук выхода не вызывается.
async function startSession(path, { login, password }) {
    const data = await apiRequest(path, { method: "POST", body: { login, password }, skipUnauthorizedHandler: true });
    return acceptSession(data, `POST ${path}`);
}

export function login(credentials) {
    return startSession("/api/auth/login", credentials);
}

export function register(credentials) {
    return startSession("/api/auth/register", credentials);
}

export async function logout() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setCsrfToken(null);
}
