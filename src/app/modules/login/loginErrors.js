// Тексты ошибок экрана входа по моделям из toFormError (services/authFormError.js).
// Тексты кейсов UC-AUTH-09, 14, 15, 17, 19, 20 — из docs/user-cases/auth.md.

const FIELD_MESSAGES = {
    login: {
        required: "Введите логин",
        invalid_format: "Логин: от 3 до 32 знаков — латинские буквы, цифры, точка, дефис и подчёркивание",
        too_long: "Логин не длиннее 32 знаков",
    },
    password: {
        required: "Введите пароль",
        too_short: "Пароль не короче 12 символов",
        too_long: "Пароль слишком длинный",
        too_common: "Этот пароль слишком распространён, придумайте другой",
    },
};

const UNAVAILABLE_MESSAGE = "Не удалось войти. Проверьте соединение и попробуйте снова.";
const UNEXPECTED_MESSAGE = "Не удалось войти. Попробуйте ещё раз.";

// Ожидание: меньше минуты — секунды, иначе минуты с округлением вверх.
const formatWait = (seconds) => (seconds < 60 ? `${seconds} с` : `${Math.ceil(seconds / 60)} мин`);

export const NO_ERRORS = { message: null, fields: {} };

// Модель содержит только известные пары поле + код (toFormError), поэтому текст есть всегда.
const fieldErrors = (fields) =>
    Object.fromEntries(Object.entries(fields).map(([field, code]) => [field, FIELD_MESSAGES[field][code]]));

// message — общее сообщение над формой, fields — сообщения у полей.
export function describeFormError(model) {
    switch (model?.kind) {
        case "fields":
            return { message: null, fields: fieldErrors(model.fields) };
        case "credentials":
            return { message: "Неверный логин или пароль", fields: {} };
        case "login_taken":
            return { message: null, fields: { login: "Этот логин уже занят" } };
        case "disabled":
            return { message: "Ваш доступ отключён администратором", fields: {} };
        case "rate_limited":
            return {
                message:
                    model.retryAfter === null
                        ? "Слишком много попыток, повторите позже"
                        : `Слишком много попыток, повторите через ${formatWait(model.retryAfter)}`,
                fields: {},
            };
        case "unavailable":
            return { message: UNAVAILABLE_MESSAGE, fields: {} };
        default:
            return { message: UNEXPECTED_MESSAGE, fields: {} };
    }
}
