import { ApiError } from "./apiClient";

// Известные пары поле + код формы входа (спека §5); единственное место, где они перечислены.
const KNOWN_FIELD_CODES = {
    login: ["required", "invalid_format", "too_long"],
    password: ["required", "too_short", "too_long", "too_common"],
};

const UNAVAILABLE = { kind: "unavailable" };
const UNEXPECTED = { kind: "unexpected" };

// Коды 400 validation_failed: неизвестные пары отбрасываются, по полю берётся первый известный код.
function fieldsFromDetails(details) {
    const fields = {};
    for (const { field, code } of details ?? []) {
        if (KNOWN_FIELD_CODES[field]?.includes(code) && !(field in fields)) {
            fields[field] = code;
        }
    }
    return fields;
}

// Ошибка входа или регистрации → сериализуемая модель для формы (спека §2.1, §2.2, §5).
// Решает только код ответа (error.code, details, Retry-After), message сервера не используется.
// kind: fields — ошибки полей по details, credentials — 401 auth_failed, login_taken — 409,
// disabled — 403 user_disabled, rate_limited — 429, unavailable — сеть, 5xx и 403 forbidden (UC-AUTH-20),
// unexpected — всё остальное: 400 без известных details, прочие 4xx, некорректный 2xx.
export function toFormError(error) {
    if (!(error instanceof ApiError)) {
        // fetch при сбое сети бросает TypeError; прочее (например, некорректное тело 2xx) — неожиданный ответ.
        return error instanceof TypeError ? UNAVAILABLE : UNEXPECTED;
    }
    if (error.status === 400 && error.code === "validation_failed") {
        const fields = fieldsFromDetails(error.details);
        return Object.keys(fields).length > 0 ? { kind: "fields", fields } : UNEXPECTED;
    }
    if (error.status === 401 && error.code === "auth_failed") {
        return { kind: "credentials" };
    }
    if (error.status === 409 && error.code === "login_taken") {
        return { kind: "login_taken" };
    }
    if (error.status === 403 && error.code === "user_disabled") {
        return { kind: "disabled" };
    }
    if (error.status === 429 && error.code === "rate_limited") {
        return { kind: "rate_limited", retryAfter: error.retryAfter };
    }
    if (error.status >= 500 || (error.status === 403 && error.code === "forbidden")) {
        return UNAVAILABLE;
    }
    return UNEXPECTED;
}
