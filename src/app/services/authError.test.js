import { clearAuthErrorFromUrl, readAuthError } from "./authError";

describe("readAuthError", () => {
    test.each([
        ["?auth_error=access_denied", "Вход отменён"],
        ["?auth_error=provider_error", "Ошибка провайдера"],
        ["?auth_error=invalid_state", "Попытка входа устарела"],
        ["?foo=1&auth_error=access_denied", "Вход отменён"],
    ])("%s → %s", (search, message) => {
        expect(readAuthError(search)).toBe(message);
    });

    test.each(["?auth_error=weird", "?auth_error=", "?auth_error=__proto__", "?auth_error=constructor", "?auth_error=toString"])("неизвестный или пустой код %j → общее сообщение", (search) => {
        expect(readAuthError(search)).toBe("Не удалось войти");
    });

    test.each(["", "?foo=1", "?auth_errors=access_denied"])("без параметра %j → null", (search) => {
        expect(readAuthError(search)).toBeNull();
    });
});

describe("clearAuthErrorFromUrl", () => {
    afterEach(() => window.history.replaceState(null, "", "/"));

    test("убирает auth_error, сохраняя путь, остальные параметры и хэш", () => {
        window.history.replaceState(null, "", "/?auth_error=access_denied&foo=1#top");
        clearAuthErrorFromUrl();
        expect(window.location.pathname).toBe("/");
        expect(window.location.search).toBe("?foo=1");
        expect(window.location.hash).toBe("#top");
    });

    test("если параметр единственный, строка запроса пустая", () => {
        window.history.replaceState(null, "", "/?auth_error=invalid_state");
        clearAuthErrorFromUrl();
        expect(window.location.search).toBe("");
    });

    test("без параметра адрес не меняется", () => {
        window.history.replaceState(null, "", "/?foo=1");
        const spy = jest.spyOn(window.history, "replaceState");
        clearAuthErrorFromUrl();
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
