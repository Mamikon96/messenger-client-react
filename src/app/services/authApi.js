import { apiRequest, setCsrfToken, ApiError } from "./apiClient";

const isNonEmptyString = (value) => typeof value === "string" && value !== "";

// Тело как у GET /api/auth/session: { user, csrfToken }. Токен отдаётся apiClient, наружу — user.
function acceptSession(data, endpoint) {
    if (!data || typeof data.user !== "object" || data.user === null || !isNonEmptyString(data.csrfToken)) {
        throw new Error(`Некорректный ответ ${endpoint}`);
    }
    setCsrfToken(data.csrfToken);
    return data.user;
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
