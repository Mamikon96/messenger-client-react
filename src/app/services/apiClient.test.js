import {
    apiRequest,
    setCsrfToken,
    setUnauthorizedHandler,
    ApiError,
} from "./apiClient";

const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
});

describe("apiClient", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        setCsrfToken(null);
        setUnauthorizedHandler(null);
    });

    afterEach(() => {
        delete global.fetch;
    });

    it("шлёт запрос с cookie same-origin и возвращает разобранный JSON", async () => {
        fetch.mockResolvedValue(reply(200, { user: { id: "1" } }));

        const data = await apiRequest("/api/auth/session");

        expect(data).toEqual({ user: { id: "1" } });
        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/auth/session");
        expect(options.credentials).toBe("same-origin");
        expect(options.method).toBe("GET");
    });

    it("возвращает null для ответа без тела", async () => {
        fetch.mockResolvedValue(reply(204));

        await expect(apiRequest("/api/auth/logout", { method: "POST" })).resolves.toBeNull();
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])(
        "добавляет X-CSRF-Token на %s",
        async (method) => {
            setCsrfToken("tok-1");
            fetch.mockResolvedValue(reply(204));

            await apiRequest("/api/x", { method });

            expect(fetch.mock.calls[0][1].headers["X-CSRF-Token"]).toBe("tok-1");
        }
    );

    it("добавляет X-CSRF-Token независимо от регистра метода", async () => {
        setCsrfToken("tok-1");
        fetch.mockResolvedValue(reply(204));

        await apiRequest("/api/x", { method: "post" });

        const options = fetch.mock.calls[0][1];
        expect(options.headers["X-CSRF-Token"]).toBe("tok-1");
        expect(options.method).toBe("POST");
    });

    it("пробрасывает signal в fetch", async () => {
        fetch.mockResolvedValue(reply(200, {}));
        const { signal } = new AbortController();

        await apiRequest("/api/x", { signal });

        expect(fetch.mock.calls[0][1].signal).toBe(signal);
    });

    it("если хук 401 бросил, вызывающий всё равно получает ApiError(401)", async () => {
        setUnauthorizedHandler(() => {
            throw new Error("handler failed");
        });
        fetch.mockResolvedValue(reply(401));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ name: "ApiError", status: 401 });
    });

    it("не добавляет X-CSRF-Token на GET", async () => {
        setCsrfToken("tok-1");
        fetch.mockResolvedValue(reply(200, {}));

        await apiRequest("/api/x");

        expect(fetch.mock.calls[0][1].headers["X-CSRF-Token"]).toBeUndefined();
    });

    it("не добавляет заголовок, если токен не задан", async () => {
        fetch.mockResolvedValue(reply(204));

        await apiRequest("/api/x", { method: "POST" });

        expect(fetch.mock.calls[0][1].headers["X-CSRF-Token"]).toBeUndefined();
    });

    it("сериализует body в JSON и ставит Content-Type", async () => {
        fetch.mockResolvedValue(reply(200, {}));

        await apiRequest("/api/x", { method: "POST", body: { a: 1 } });

        const options = fetch.mock.calls[0][1];
        expect(options.body).toBe(JSON.stringify({ a: 1 }));
        expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("на 401 вызывает хук и бросает ApiError со статусом", async () => {
        const onUnauthorized = jest.fn();
        setUnauthorizedHandler(onUnauthorized);
        fetch.mockResolvedValue(reply(401));

        const error = await apiRequest("/api/x").catch((e) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(401);
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it("на 401 без хука просто бросает ApiError", async () => {
        fetch.mockResolvedValue(reply(401));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ status: 401 });
    });

    it("на 403 бросает ApiError и не вызывает хук 401", async () => {
        const onUnauthorized = jest.fn();
        setUnauthorizedHandler(onUnauthorized);
        fetch.mockResolvedValue(reply(403));

        await expect(apiRequest("/api/x", { method: "POST" })).rejects.toMatchObject({ status: 403 });
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it("кладёт тело ошибки в ApiError.data", async () => {
        fetch.mockResolvedValue(reply(500, { message: "boom" }));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({
            status: 500,
            data: { message: "boom" },
        });
    });

    it("сетевую ошибку не превращает в 401 и хук не зовёт", async () => {
        const onUnauthorized = jest.fn();
        setUnauthorizedHandler(onUnauthorized);
        fetch.mockRejectedValue(new TypeError("Failed to fetch"));

        const error = await apiRequest("/api/x").catch((e) => e);

        expect(error).toBeInstanceOf(TypeError);
        expect(error).not.toBeInstanceOf(ApiError);
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it("не падает на невалидном JSON в ошибке", async () => {
        fetch.mockResolvedValue({ ok: false, status: 502, text: () => Promise.resolve("<html>") });

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ status: 502, data: null });
    });
});
