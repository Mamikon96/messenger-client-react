// Проверка полей входа и регистрации до отправки (docs/client-integration.md §1.3, «Коды details»).
// Возвращает ту же модель, что toFormError (kind: "fields"), поэтому тексты берутся из одного места — loginErrors.js.

const LOGIN_PATTERN = /^[a-z0-9._-]{3,32}$/;
const LOGIN_MAX_LENGTH = 32;
const PASSWORD_MIN_BYTES = 12;
const PASSWORD_MAX_BYTES = 256;

const encoder = new TextEncoder();

// Сервер делает trim и нижний регистр, затем проверяет формат; длина в единицах UTF-16, как на сервере; приоритет кодов: required > too_long > invalid_format.
function loginCode(value, { checkFormat }) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "") return "required";
    if (!checkFormat) return null;
    if (normalized.length > LOGIN_MAX_LENGTH) return "too_long";
    return LOGIN_PATTERN.test(normalized) ? null : "invalid_format";
}

// Пароль без trim и нормализации; длина в байтах UTF-8. При входе проверяется только непустота.
function passwordCode(value, { checkPolicy }) {
    if (value === "") return "required";
    if (!checkPolicy) return null;
    const bytes = encoder.encode(value).length;
    if (bytes < PASSWORD_MIN_BYTES) return "too_short";
    return bytes > PASSWORD_MAX_BYTES ? "too_long" : null;
}

// mode: "login" | "register". null — ошибок нет, иначе { kind: "fields", fields: { login?, password? } }.
export function validateCredentials(mode, { login, password }) {
    const strict = mode === "register";
    const codes = {
        login: loginCode(login, { checkFormat: strict }),
        password: passwordCode(password, { checkPolicy: strict }),
    };
    const fields = Object.fromEntries(Object.entries(codes).filter(([, code]) => code !== null));
    return Object.keys(fields).length > 0 ? { kind: "fields", fields } : null;
}
