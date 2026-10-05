import { apiRequest, setCsrfToken, ApiError } from "./apiClient";

const isNonEmptyString = (value) => typeof value === "string" && value !== "";

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

    if (!data || typeof data.user !== "object" || data.user === null || !isNonEmptyString(data.csrfToken)) {
        throw new Error("Некорректный ответ GET /api/auth/session");
    }
    setCsrfToken(data.csrfToken);
    return data.user;
}

export async function logout() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setCsrfToken(null);
}
