import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Login from "./Login";
import { rootReducer } from "../../store";
import { checkSession } from "../../reducers/auth";
import * as authApi from "../../services/authApi";

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

    test.each([
        ["Вход", "Войти", "login", 401, "auth_failed"],
        ["Регистрация", "Зарегистрироваться", "register", 409, "login_taken"],
    ])("ошибка сервера в режиме «%s»: общее сообщение в role=alert, форма и введённый логин остаются", async (tab, submit, apiName, status, code) => {
        authApi[apiName].mockRejectedValue(Object.assign(new Error(`API error ${status}`), { status, code }));
        renderLogin();
        fireEvent.click(screen.getByRole("tab", { name: tab }));

        fillAndSubmit("alice", "wrong-password-1", submit);

        expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось войти. Попробуйте ещё раз.");
        expect(screen.getByLabelText("Логин")).toHaveValue("alice");
        expect(screen.getByRole("button", { name: submit })).toBeInTheDocument();
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

describe("Login: без OAuth", () => {
    test("на экране входа нет ссылок провайдеров и блока ошибки", () => {
        renderLogin();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.queryByText(/Google|GitHub/)).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});
