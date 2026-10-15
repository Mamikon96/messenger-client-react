import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Login from "./Login";
import { rootReducer } from "../../store";
import { checkSession } from "../../reducers/auth";
import * as authApi from "../../services/authApi";
import { ApiError } from "../../services/apiClient";

jest.mock("../../services/authApi");

const user = { id: "1", login: "alice", firstName: "Alice", lastName: "Tester", name: "Alice Tester", avatarUrl: "" };

// Экран входа показывается без сессии: store в состоянии anonymous.
const renderLogin = () => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(null, "req"));
    render(
        <Provider store={store}>
            <Login />
        </Provider>
    );
    return { store };
};

const fillAndSubmit = (login, password, submitName) => {
    fireEvent.change(screen.getByLabelText("Логин"), { target: { value: login } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: password } });
    fireEvent.click(screen.getByRole("button", { name: submitName }));
};

afterEach(() => {
    jest.resetAllMocks();
});

describe("Login: форма логина и пароля", () => {
    test("по умолчанию режим «Вход»: вкладки, поля логина и пароля, кнопка «Войти»", () => {
        renderLogin();
        expect(screen.getByRole("tab", { name: "Вход" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "Регистрация" })).toHaveAttribute("aria-selected", "false");
        expect(screen.getByLabelText("Логин")).toHaveAttribute("autocomplete", "username");
        expect(screen.getByLabelText("Пароль")).toHaveAttribute("type", "password");
        expect(screen.getByLabelText("Пароль")).toHaveAttribute("autocomplete", "current-password");
        expect(screen.getByRole("button", { name: "Войти" })).toHaveAttribute("type", "submit");
    });

    test("вкладка «Регистрация»: только логин и пароль, кнопка «Зарегистрироваться»", () => {
        renderLogin();
        fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));
        expect(screen.getByRole("tab", { name: "Регистрация" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "Вход" })).toHaveAttribute("aria-selected", "false");
        expect(screen.getAllByRole("textbox")).toHaveLength(1);
        expect(screen.getByLabelText("Логин")).toBeInTheDocument();
        expect(screen.getByLabelText("Пароль")).toHaveAttribute("autocomplete", "new-password");
        expect(screen.getByRole("button", { name: "Зарегистрироваться" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Войти" })).not.toBeInTheDocument();
    });

    test("вкладки связаны с формой: tabpanel подписан активной вкладкой, неактивная вне порядка Tab", () => {
        renderLogin();
        const panel = screen.getByRole("tabpanel", { name: "Вход" });
        expect(screen.getByRole("tab", { name: "Вход" })).toHaveAttribute("aria-controls", panel.id);
        expect(screen.getByRole("tab", { name: "Вход" })).toHaveAttribute("tabindex", "0");
        expect(screen.getByRole("tab", { name: "Регистрация" })).toHaveAttribute("tabindex", "-1");

        fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));

        expect(screen.getByRole("tabpanel", { name: "Регистрация" })).toBe(panel);
    });

    test.each([
        ["ArrowRight", "Регистрация"],
        ["ArrowLeft", "Регистрация"],
        ["End", "Регистрация"],
        ["Home", "Вход"],
    ])("клавиша %s на вкладке выбирает «%s» и переводит на неё фокус", (key, expected) => {
        renderLogin();
        const tab = screen.getByRole("tab", { name: "Вход" });
        tab.focus();

        fireEvent.keyDown(tab, { key });

        expect(screen.getByRole("tab", { name: expected })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: expected })).toHaveFocus();
    });

    test("«Войти» отправляет логин и пароль в authApi.login, store переходит в authenticated", async () => {
        authApi.login.mockResolvedValue(user);
        const { store } = renderLogin();

        fillAndSubmit("Alice", "correct-horse-1", "Войти");

        await waitFor(() => expect(store.getState().auth).toEqual({ status: "authenticated", user }));
        expect(authApi.login).toHaveBeenCalledWith({ login: "Alice", password: "correct-horse-1" });
        expect(authApi.register).not.toHaveBeenCalled();
    });

    test("«Зарегистрироваться» отправляет логин и пароль в authApi.register", async () => {
        authApi.register.mockResolvedValue(user);
        const { store } = renderLogin();
        fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));

        fillAndSubmit("new-user", "correct-horse-1", "Зарегистрироваться");

        await waitFor(() => expect(store.getState().auth).toEqual({ status: "authenticated", user }));
        expect(authApi.register).toHaveBeenCalledWith({ login: "new-user", password: "correct-horse-1" });
        expect(authApi.login).not.toHaveBeenCalled();
    });

    test("сообщение об ошибке скрывается при переключении режима", async () => {
        authApi.login.mockRejectedValue(new TypeError("Failed to fetch"));
        renderLogin();
        fillAndSubmit("alice", "correct-horse-1", "Войти");
        await screen.findByRole("alert");

        fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});

const apiError = (status, code, { details, retryAfter } = {}) =>
    new ApiError(status, { error: { code, message: "текст сервера не показывается", ...(details && { details }) } }, { retryAfter });

describe("Login: ошибки сервера", () => {
    test("401 auth_failed: общее сообщение «Неверный логин или пароль», форма и логин остаются [UC-AUTH-14]", async () => {
        authApi.login.mockRejectedValue(apiError(401, "auth_failed"));
        const { store } = renderLogin();

        fillAndSubmit("alice", "wrong-password-1", "Войти");

        expect(await screen.findByRole("alert")).toHaveTextContent("Неверный логин или пароль");
        expect(screen.getByLabelText("Логин")).toHaveValue("alice");
        expect(screen.getByLabelText("Логин")).not.toHaveAttribute("aria-invalid");
        expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
        expect(store.getState().auth.status).toBe("anonymous");
    });

    test("повторная отправка убирает сообщение; верные данные открывают мессенджер", async () => {
        authApi.login.mockRejectedValueOnce(apiError(401, "auth_failed")).mockResolvedValueOnce(user);
        const { store } = renderLogin();
        fillAndSubmit("alice", "wrong-password-1", "Войти");
        await screen.findByRole("alert");

        fillAndSubmit("alice", "correct-horse-1", "Войти");

        await waitFor(() => expect(store.getState().auth.status).toBe("authenticated"));
        expect(screen.queryByText("Неверный логин или пароль")).not.toBeInTheDocument();
    });

    test("409 login_taken: сообщение у поля логина, а не общее [UC-AUTH-15]", async () => {
        authApi.register.mockRejectedValue(apiError(409, "login_taken"));
        renderLogin();
        fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));

        fillAndSubmit("Alice", "correct-horse-1", "Зарегистрироваться");

        const message = await screen.findByText("Этот логин уже занят");
        const field = screen.getByLabelText("Логин");
        expect(field).toHaveAttribute("aria-invalid", "true");
        expect(field).toHaveAccessibleDescription("Этот логин уже занят");
        expect(message).toHaveAttribute("role", "alert");
        expect(screen.getByLabelText("Пароль")).not.toHaveAttribute("aria-invalid");
        expect(field).toHaveValue("Alice");
    });

    test("400 validation_failed: ошибки у полей по field и code, message сервера не используется", async () => {
        authApi.register.mockRejectedValue(
            apiError(400, "validation_failed", {
                details: [
                    { field: "login", code: "invalid_format" },
                    { field: "password", code: "too_short" },
                ],
            })
        );
        renderLogin();
        fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));

        fillAndSubmit("new-user", "correct-horse-1", "Зарегистрироваться");

        await waitFor(() => expect(screen.getByLabelText("Логин")).toHaveAttribute("aria-invalid", "true"));
        expect(screen.getByLabelText("Логин")).toHaveAccessibleDescription(/латинские буквы, цифры/);
        expect(screen.getByLabelText("Пароль")).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByLabelText("Пароль")).toHaveAccessibleDescription("Пароль не короче 12 символов");
        expect(screen.queryByText(/текст сервера/)).not.toBeInTheDocument();
    });

    test.each([
        ["login", "required", "Введите логин"],
        ["login", "too_long", "Логин не длиннее 32 знаков"],
        ["password", "required", "Введите пароль"],
        ["password", "too_long", "Пароль слишком длинный"],
    ])("400 validation_failed: поле %s, код %s → «%s»", async (field, code, text) => {
        authApi.login.mockRejectedValue(apiError(400, "validation_failed", { details: [{ field, code }] }));
        renderLogin();

        fillAndSubmit("alice", "correct-horse-1", "Войти");

        expect(await screen.findByText(text)).toBeInTheDocument();
    });

    test("400 too_common: сообщение у поля пароля [UC-AUTH-19]", async () => {
        authApi.register.mockRejectedValue(
            apiError(400, "validation_failed", { details: [{ field: "password", code: "too_common" }] })
        );
        renderLogin();
        fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));

        fillAndSubmit("new-user", "password1234", "Зарегистрироваться");

        const field = screen.getByLabelText("Пароль");
        await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
        expect(field).toHaveAccessibleDescription("Этот пароль слишком распространён, придумайте другой");
        expect(screen.getByLabelText("Логин")).not.toHaveAttribute("aria-invalid");
    });

    test("ошибка поля исчезает, когда поле меняют; ошибка другого поля остаётся", async () => {
        authApi.register.mockRejectedValue(
            apiError(400, "validation_failed", {
                details: [
                    { field: "login", code: "required" },
                    { field: "password", code: "required" },
                ],
            })
        );
        renderLogin();
        fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));
        fillAndSubmit("new-user", "correct-horse-1", "Зарегистрироваться");
        await screen.findByText("Введите логин");

        fireEvent.change(screen.getByLabelText("Логин"), { target: { value: "n" } });

        expect(screen.queryByText("Введите логин")).not.toBeInTheDocument();
        expect(screen.getByText("Введите пароль")).toBeInTheDocument();
    });

    test("403 user_disabled: сообщение об отключении [UC-AUTH-09]", async () => {
        authApi.login.mockRejectedValue(apiError(403, "user_disabled"));
        renderLogin();

        fillAndSubmit("disabled", "correct-horse-1", "Войти");

        expect(await screen.findByRole("alert")).toHaveTextContent("Ваш доступ отключён администратором");
    });

    test("429 rate_limited: время ожидания из Retry-After [UC-AUTH-17]", async () => {
        authApi.login.mockRejectedValue(apiError(429, "rate_limited", { retryAfter: 42 }));
        renderLogin();

        fillAndSubmit("alice", "correct-horse-1", "Войти");

        expect(await screen.findByRole("alert")).toHaveTextContent("Слишком много попыток, повторите через 42 с");
    });

    test.each([
        [0, "0 с"],
        [59, "59 с"],
        [60, "1 мин"],
        [61, "2 мин"],
        [900, "15 мин"],
    ])("429 Retry-After %i → «повторите через %s»", async (retryAfter, duration) => {
        authApi.login.mockRejectedValue(apiError(429, "rate_limited", { retryAfter }));
        renderLogin();

        fillAndSubmit("alice", "correct-horse-1", "Войти");

        expect(await screen.findByRole("alert")).toHaveTextContent(`Слишком много попыток, повторите через ${duration}`);
    });

    test.each([
        ["400 без details", apiError(400, "validation_failed")],
        ["неизвестный код 4xx", apiError(404, "not_found")],
        ["некорректный ответ 2xx", new Error("Некорректный ответ POST /api/auth/login")],
    ])("%s: общее «Не удалось войти. Попробуйте ещё раз.», без текста про соединение", async (_, error) => {
        authApi.login.mockRejectedValue(error);
        renderLogin();

        fillAndSubmit("alice", "correct-horse-1", "Войти");

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("Не удалось войти. Попробуйте ещё раз.");
        expect(alert).not.toHaveTextContent("соединение");
    });

    test("неизвестный код у поля: текста про соединение под полем нет, показано общее сообщение", async () => {
        authApi.login.mockRejectedValue(apiError(400, "validation_failed", { details: [{ field: "login", code: "weird" }] }));
        renderLogin();

        fillAndSubmit("alice", "correct-horse-1", "Войти");

        expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось войти. Попробуйте ещё раз.");
        expect(screen.getByLabelText("Логин")).not.toHaveAttribute("aria-invalid");
        expect(screen.queryByText(/соединение/)).not.toBeInTheDocument();
    });

    test("429 rate_limited без Retry-After: «повторите позже»", async () => {
        authApi.login.mockRejectedValue(apiError(429, "rate_limited"));
        renderLogin();

        fillAndSubmit("alice", "correct-horse-1", "Войти");

        expect(await screen.findByRole("alert")).toHaveTextContent("Слишком много попыток, повторите позже");
    });

    test.each([
        ["сеть", new TypeError("Failed to fetch")],
        ["500", apiError(500, "internal_error")],
        ["403 forbidden", apiError(403, "forbidden")],
    ])("%s: «Не удалось войти…», логин остаётся, повтор проходит [UC-AUTH-20]", async (_, error) => {
        authApi.login.mockRejectedValueOnce(error).mockResolvedValueOnce(user);
        const { store } = renderLogin();

        fillAndSubmit("alice", "correct-horse-1", "Войти");

        expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось войти. Проверьте соединение и попробуйте снова.");
        expect(screen.getByLabelText("Логин")).toHaveValue("alice");

        fireEvent.click(screen.getByRole("button", { name: "Войти" }));

        await waitFor(() => expect(store.getState().auth.status).toBe("authenticated"));
    });
});

describe("Login: проверка полей до отправки [UC-AUTH-16]", () => {
    const openRegister = () => {
        const utils = renderLogin();
        fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));
        return utils;
    };

    test.each([
        ["ab", "Логин: от 3 до 32 знаков — латинские буквы, цифры, точка, дефис и подчёркивание"],
        ["a b", "Логин: от 3 до 32 знаков — латинские буквы, цифры, точка, дефис и подчёркивание"],
        ["логин", "Логин: от 3 до 32 знаков — латинские буквы, цифры, точка, дефис и подчёркивание"],
        ["a".repeat(33), "Логин не длиннее 32 знаков"],
        ["", "Введите логин"],
    ])("регистрация, логин %j: подсказка у поля, запрос не уходит", (value, text) => {
        openRegister();

        fillAndSubmit(value, "correct-horse-1", "Зарегистрироваться");

        expect(screen.getByLabelText("Логин")).toHaveAccessibleDescription(text);
        expect(screen.getByLabelText("Пароль")).not.toHaveAttribute("aria-invalid");
        expect(authApi.register).not.toHaveBeenCalled();
    });

    test("регистрация, пароль из 11 символов: подсказка у поля пароля, запрос не уходит", () => {
        openRegister();

        fillAndSubmit("new-user", "a".repeat(11), "Зарегистрироваться");

        expect(screen.getByLabelText("Пароль")).toHaveAccessibleDescription("Пароль не короче 12 символов");
        expect(screen.getByLabelText("Логин")).not.toHaveAttribute("aria-invalid");
        expect(authApi.register).not.toHaveBeenCalled();
    });

    test("регистрация, слишком длинный пароль (байты UTF-8): «Пароль слишком длинный», запрос не уходит", () => {
        openRegister();

        fillAndSubmit("new-user", "я".repeat(129), "Зарегистрироваться");

        expect(screen.getByLabelText("Пароль")).toHaveAccessibleDescription("Пароль слишком длинный");
        expect(authApi.register).not.toHaveBeenCalled();
    });

    test("регистрация: логин с заглавными и пробелами по краям проходит проверку и уходит на сервер", async () => {
        authApi.register.mockResolvedValue(user);
        const { store } = openRegister();

        fillAndSubmit("  New-User ", "correct-horse-1", "Зарегистрироваться");

        await waitFor(() => expect(store.getState().auth.status).toBe("authenticated"));
        expect(authApi.register).toHaveBeenCalledTimes(1);
    });

    test("вход: пустое поле — «Введите логин» / «Введите пароль», запрос не уходит", () => {
        renderLogin();

        fillAndSubmit("", "correct-horse-1", "Войти");
        expect(screen.getByLabelText("Логин")).toHaveAccessibleDescription("Введите логин");

        fillAndSubmit("alice", "", "Войти");
        expect(screen.getByLabelText("Пароль")).toHaveAccessibleDescription("Введите пароль");
        expect(authApi.login).not.toHaveBeenCalled();
    });

    test("вход: формат логина и короткий пароль не проверяются, запрос уходит", async () => {
        authApi.login.mockRejectedValue(apiError(401, "auth_failed"));
        renderLogin();

        fillAndSubmit("A b!", "1", "Войти");

        expect(await screen.findByRole("alert")).toHaveTextContent("Неверный логин или пароль");
        expect(authApi.login).toHaveBeenCalledWith({ login: "A b!", password: "1" });
    });

    test("правка поля снимает его подсказку, после исправления запрос уходит", async () => {
        authApi.register.mockResolvedValue(user);
        const { store } = openRegister();
        fillAndSubmit("ab", "correct-horse-1", "Зарегистрироваться");

        fireEvent.change(screen.getByLabelText("Логин"), { target: { value: "abc" } });
        expect(screen.getByLabelText("Логин")).not.toHaveAttribute("aria-invalid");
        fireEvent.click(screen.getByRole("button", { name: "Зарегистрироваться" }));

        await waitFor(() => expect(store.getState().auth.status).toBe("authenticated"));
        expect(authApi.register).toHaveBeenCalledTimes(1);
    });
});

describe("Login: одна отправка за раз [UC-AUTH-18]", () => {
    // Запрос «висит», пока тест не вызовет resolve.
    const pendingLogin = () => {
        let resolve;
        authApi.login.mockReturnValue(new Promise((r) => { resolve = r; }));
        return () => resolve(user);
    };

    test("до ответа кнопка занята, повторный клик и Enter не шлют второй запрос", async () => {
        const finish = pendingLogin();
        const { store } = renderLogin();
        fillAndSubmit("alice", "correct-horse-1", "Войти");

        const button = screen.getByRole("button", { name: "Войти" });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("aria-busy", "true");
        fireEvent.click(button);
        fireEvent.submit(screen.getByRole("tabpanel"));

        expect(authApi.login).toHaveBeenCalledTimes(1);
        finish();
        await waitFor(() => expect(store.getState().auth.status).toBe("authenticated"));
        expect(authApi.login).toHaveBeenCalledTimes(1);
    });

    test("после ответа с ошибкой кнопка снова доступна, повтор уходит", async () => {
        authApi.login.mockRejectedValueOnce(apiError(401, "auth_failed")).mockResolvedValueOnce(user);
        const { store } = renderLogin();
        fillAndSubmit("alice", "wrong-password-1", "Войти");
        await screen.findByRole("alert");

        const button = screen.getByRole("button", { name: "Войти" });
        expect(button).toBeEnabled();
        expect(button).not.toHaveAttribute("aria-busy");
        fireEvent.click(button);

        await waitFor(() => expect(store.getState().auth.status).toBe("authenticated"));
        expect(authApi.login).toHaveBeenCalledTimes(2);
    });

    test("пока запрос идёт, вкладки заблокированы: режим и ошибка чужого режима не появляются", async () => {
        let reject;
        authApi.login.mockReturnValue(new Promise((_, r) => { reject = r; }));
        renderLogin();
        fillAndSubmit("alice", "correct-horse-1", "Войти");

        const register = screen.getByRole("tab", { name: "Регистрация" });
        expect(register).toBeDisabled();
        fireEvent.click(register);
        fireEvent.keyDown(screen.getByRole("tab", { name: "Вход" }), { key: "ArrowRight" });
        expect(screen.getByRole("tab", { name: "Вход" })).toHaveAttribute("aria-selected", "true");

        reject(apiError(401, "auth_failed"));

        expect(await screen.findByRole("alert")).toHaveTextContent("Неверный логин или пароль");
        expect(screen.getByRole("tab", { name: "Регистрация" })).toBeEnabled();
    });
});

describe("Login: без OAuth", () => {
    test("на экране входа нет ссылок провайдеров и блока ошибки", () => {
        renderLogin();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.queryByText(/Google|GitHub/)).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});
