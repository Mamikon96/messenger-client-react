import {
    apiRequest,
    setCsrfToken,
    setUnauthorizedHandler,
    setCsrfRecoveryHandler,
    ApiError,
} from "./apiClient";

const reply = (status, body, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] ?? null },
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
});

const unauthorizedBody = { error: { code: "unauthorized", message: "no session" } };

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
        fetch.mockResolvedValue(reply(401, unauthorizedBody));

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

    it("на 401 unauthorized вызывает хук и бросает ApiError со статусом", async () => {
        const onUnauthorized = jest.fn();
        setUnauthorizedHandler(onUnauthorized);
        fetch.mockResolvedValue(reply(401, unauthorizedBody));

        const error = await apiRequest("/api/x").catch((e) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(401);
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it("401 auth_failed не вызывает хук и бросает ApiError с кодом", async () => {
        const onUnauthorized = jest.fn();
        setUnauthorizedHandler(onUnauthorized);
        fetch.mockResolvedValue(reply(401, { error: { code: "auth_failed", message: "bad" } }));

        await expect(apiRequest("/api/auth/login", { method: "POST" })).rejects.toMatchObject({
            status: 401,
            code: "auth_failed",
        });
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it("401 без кода (пустое тело) не вызывает хук", async () => {
        const onUnauthorized = jest.fn();
        setUnauthorizedHandler(onUnauthorized);
        fetch.mockResolvedValue(reply(401));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ status: 401, code: null });
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it("на 401 unauthorized без хука просто бросает ApiError", async () => {
        fetch.mockResolvedValue(reply(401, unauthorizedBody));

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

describe("apiClient: skipUnauthorizedHandler", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        setUnauthorizedHandler(null);
    });

    afterEach(() => {
        delete global.fetch;
    });

    it("401 с skipUnauthorizedHandler не вызывает хук, но бросает ApiError", async () => {
        const handler = jest.fn();
        setUnauthorizedHandler(handler);
        fetch.mockResolvedValue(reply(401, unauthorizedBody));

        await expect(
            apiRequest("/api/auth/session", { skipUnauthorizedHandler: true })
        ).rejects.toBeInstanceOf(ApiError);
        expect(handler).not.toHaveBeenCalled();
    });
});

describe("apiClient: ApiError.code, details, retryAfter", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        setUnauthorizedHandler(null);
    });

    afterEach(() => {
        delete global.fetch;
    });

    it("берёт code и details из data.error", async () => {
        const details = [{ field: "password", code: "too_short" }];
        fetch.mockResolvedValue(
            reply(400, { error: { code: "validation_failed", message: "x", details } })
        );

        await expect(apiRequest("/api/auth/register", { method: "POST" })).rejects.toMatchObject({
            status: 400,
            code: "validation_failed",
            details,
            retryAfter: null,
        });
    });

    it("code есть, details нет — details равен null", async () => {
        fetch.mockResolvedValue(reply(409, { error: { code: "login_taken" } }));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ code: "login_taken", details: null });
    });

    it.each([
        ["пустое тело", undefined],
        ["тело без error", { message: "boom" }],
        ["error не объект", { error: "boom" }],
        ["error: null", { error: null }],
    ])("%s — code, details и retryAfter равны null", async (_name, body) => {
        fetch.mockResolvedValue(reply(500, body));

        const error = await apiRequest("/api/x").catch((e) => e);

        expect(error.code).toBeNull();
        expect(error.details).toBeNull();
        expect(error.retryAfter).toBeNull();
    });

    it("code не строка — code равен null", async () => {
        fetch.mockResolvedValue(reply(400, { error: { code: 401, details: [] } }));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ code: null, details: [] });
    });

    it("details не массив — details равен null", async () => {
        fetch.mockResolvedValue(reply(400, { error: { code: "x", details: { field: "a" } } }));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ code: "x", details: null });
    });

    it("невалидный JSON в ошибке — code и details равны null", async () => {
        fetch.mockResolvedValue({
            ok: false,
            status: 502,
            headers: { get: () => null },
            text: () => Promise.resolve("<html>"),
        });

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ code: null, details: null });
    });

    it("на 429 парсит Retry-After в секунды", async () => {
        fetch.mockResolvedValue(
            reply(429, { error: { code: "rate_limited" } }, { "Retry-After": "42" })
        );

        await expect(apiRequest("/api/auth/login", { method: "POST" })).rejects.toMatchObject({
            status: 429,
            code: "rate_limited",
            retryAfter: 42,
        });
    });

    it.each([
        ["0", "0", 0],
        ["с пробелами", " 42 ", 42],
    ])("на 429 Retry-After %s — retryAfter равен числу", async (_name, header, expected) => {
        fetch.mockResolvedValue(reply(429, { error: { code: "rate_limited" } }, { "Retry-After": header }));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ retryAfter: expected });
    });

    it("Retry-After не на 429 игнорируется", async () => {
        fetch.mockResolvedValue(reply(503, undefined, { "Retry-After": "30" }));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ status: 503, retryAfter: null });
    });

    it.each([
        ["отсутствует", {}],
        ["пустой", { "Retry-After": "" }],
        ["нечисловой", { "Retry-After": "soon" }],
        ["отрицательный", { "Retry-After": "-5" }],
        ["дробный", { "Retry-After": "1.5" }],
        ["число с мусором", { "Retry-After": "10s" }],
    ])("на 429 Retry-After %s — retryAfter равен null", async (_name, headers) => {
        fetch.mockResolvedValue(reply(429, { error: { code: "rate_limited" } }, headers));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ status: 429, retryAfter: null });
    });
});

describe("apiClient: восстановление после 403 csrf_invalid", () => {
    const csrfBody = { error: { code: "csrf_invalid", message: "bad token" } };

    beforeEach(() => {
        global.fetch = jest.fn();
        setCsrfToken("old");
        setUnauthorizedHandler(null);
        setCsrfRecoveryHandler(null);
    });

    afterEach(() => {
        delete global.fetch;
    });

    it("вызывает перечитывание сессии и повторяет запрос один раз с новым токеном", async () => {
        const recover = jest.fn(async () => {
            setCsrfToken("new");
            return true;
        });
        setCsrfRecoveryHandler(recover);
        fetch.mockResolvedValueOnce(reply(403, csrfBody)).mockResolvedValueOnce(reply(201, { ok: 1 }));

        const data = await apiRequest("/api/x", { method: "POST", body: { a: 1 } });

        expect(data).toEqual({ ok: 1 });
        expect(recover).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[0][1].headers["X-CSRF-Token"]).toBe("old");
        expect(fetch.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("new");
        expect(fetch.mock.calls[1][1].body).toBe(JSON.stringify({ a: 1 }));
    });

    it("повторный 403 — обычный ApiError, без второго повтора и без хука 401", async () => {
        const onUnauthorized = jest.fn();
        setUnauthorizedHandler(onUnauthorized);
        const recover = jest.fn(async () => true);
        setCsrfRecoveryHandler(recover);
        fetch.mockResolvedValue(reply(403, csrfBody));

        await expect(apiRequest("/api/x", { method: "POST" })).rejects.toMatchObject({ status: 403, code: "csrf_invalid" });

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(recover).toHaveBeenCalledTimes(1);
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it("параллельные 403 ждут одно перечитывание, каждый запрос повторяется", async () => {
        let release;
        const recover = jest.fn(
            () => new Promise((resolve) => {
                release = () => resolve(true);
            })
        );
        setCsrfRecoveryHandler(recover);
        fetch.mockImplementation((url, options) =>
            Promise.resolve(options.headers["X-CSRF-Token"] === "old" ? reply(403, csrfBody) : reply(200, { url }))
        );

        const first = apiRequest("/api/a", { method: "POST" });
        const second = apiRequest("/api/b", { method: "DELETE" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        setCsrfToken("new");
        release();

        await expect(Promise.all([first, second])).resolves.toEqual([{ url: "/api/a" }, { url: "/api/b" }]);
        expect(recover).toHaveBeenCalledTimes(1);
    });

    it("если перечитывание сообщило «не повторять» (другой пользователь, закрытая сессия), запрос завершается исходным 403", async () => {
        setCsrfRecoveryHandler(jest.fn(async () => false));
        fetch.mockResolvedValue(reply(403, csrfBody));

        await expect(apiRequest("/api/x", { method: "POST" })).rejects.toMatchObject({ status: 403, code: "csrf_invalid" });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("если перечитывание упало, запрос завершается исходным 403", async () => {
        setCsrfRecoveryHandler(jest.fn(async () => {
            throw new TypeError("Failed to fetch");
        }));
        fetch.mockResolvedValue(reply(403, csrfBody));

        await expect(apiRequest("/api/x", { method: "POST" })).rejects.toMatchObject({ status: 403, code: "csrf_invalid" });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("403 с другим кодом или без кода не запускает перечитывание", async () => {
        const recover = jest.fn(async () => true);
        setCsrfRecoveryHandler(recover);
        fetch.mockResolvedValueOnce(reply(403, { error: { code: "user_disabled" } })).mockResolvedValueOnce(reply(403));

        await expect(apiRequest("/api/x", { method: "POST" })).rejects.toMatchObject({ status: 403 });
        await expect(apiRequest("/api/x", { method: "POST" })).rejects.toMatchObject({ status: 403 });

        expect(recover).not.toHaveBeenCalled();
    });

    it("403 csrf_invalid на GET не запускает перечитывание", async () => {
        const recover = jest.fn(async () => true);
        setCsrfRecoveryHandler(recover);
        fetch.mockResolvedValue(reply(403, csrfBody));

        await expect(apiRequest("/api/x")).rejects.toMatchObject({ status: 403, code: "csrf_invalid" });

        expect(recover).not.toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("без хука 403 csrf_invalid — обычный ApiError", async () => {
        fetch.mockResolvedValue(reply(403, csrfBody));

        await expect(apiRequest("/api/x", { method: "POST" })).rejects.toMatchObject({ status: 403, code: "csrf_invalid" });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
