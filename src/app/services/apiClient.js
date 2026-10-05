const CSRF_HEADER = "X-CSRF-Token";
const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

let csrfToken = null;
let unauthorizedHandler = null;

export class ApiError extends Error {
    constructor(status, data) {
        super(`API error ${status}`);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
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

export async function apiRequest(path, { method = "GET", body, signal } = {}) {
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
        try {
            if (response.status === 401 && unauthorizedHandler) {
                unauthorizedHandler();
            }
        } catch {
            // сбой хука не должен подменять ошибку запроса
        }
        throw new ApiError(response.status, data);
    }
    return data;
}
