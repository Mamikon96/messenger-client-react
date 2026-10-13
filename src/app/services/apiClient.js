const CSRF_HEADER = "X-CSRF-Token";
const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

let csrfToken = null;
let unauthorizedHandler = null;

export class ApiError extends Error {
    constructor(status, data, { retryAfter = null } = {}) {
        super(`API error ${status}`);
        const errorBody = data?.error;
        const hasErrorBody = typeof errorBody === "object" && errorBody !== null;
        this.name = "ApiError";
        this.status = status;
        this.data = data;
        this.code = hasErrorBody && typeof errorBody.code === "string" ? errorBody.code : null;
        this.details = hasErrorBody && Array.isArray(errorBody.details) ? errorBody.details : null;
        this.retryAfter = retryAfter;
    }
}

export function setCsrfToken(token) {
    csrfToken = token;
}

export function setUnauthorizedHandler(handler) {
    unauthorizedHandler = handler;
}

async function parseBody(response) {
    const text = await response.text();
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function parseRetryAfter(response) {
    if (response.status !== 429) {
        return null;
    }
    const value = response.headers.get("Retry-After");
    return value !== null && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

export async function apiRequest(path, { method = "GET", body, signal, skipUnauthorizedHandler = false } = {}) {
    const httpMethod = method.toUpperCase();
    const headers = {};
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }
    if (csrfToken && UNSAFE_METHODS.includes(httpMethod)) {
        headers[CSRF_HEADER] = csrfToken;
    }

    const response = await fetch(path, {
        method: httpMethod,
        headers,
        credentials: "same-origin",
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
    });
    const data = await parseBody(response);

    if (!response.ok) {
        const error = new ApiError(response.status, data, { retryAfter: parseRetryAfter(response) });
        try {
            if (response.status === 401 && error.code === "unauthorized" && !skipUnauthorizedHandler && unauthorizedHandler) {
                unauthorizedHandler();
            }
        } catch {
            // сбой хука не должен подменять ошибку запроса
        }
        throw error;
    }
    return data;
}
