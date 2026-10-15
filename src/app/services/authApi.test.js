import { fetchSession, login, logout, register } from "./authApi";
import { apiRequest, setCsrfToken, setUnauthorizedHandler } from "./apiClient";

const reply = (status, body, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] ?? null },
    text: () => Promise.resolve(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body)),
});

const user = { id: "1", login: "ann", firstName: "Ann", lastName: "", name: "Ann", avatarUrl: "http://a/b.png" };

// Каждое поле SessionUser обязательно: id, login, firstName, name — непустые строки, lastName и avatarUrl — строки (могут быть "").
const INVALID_USERS = [
    ["id отсутствует", { id: undefined }],
    ["id пустой", { id: "" }],
    ["id число", { id: 7 }],
    ["login отсутствует", { login: undefined }],
    ["login пустой", { login: "" }],
    ["firstName отсутствует", { firstName: undefined }],
    ["firstName пустой", { firstName: "" }],
    ["lastName отсутствует", { lastName: undefined }],
    ["lastName не строка", { lastName: null }],
    ["name отсутствует", { name: undefined }],
    ["name пустой", { name: "" }],
    ["avatarUrl отсутствует", { avatarUrl: undefined }],
    ["avatarUrl не строка", { avatarUrl: null }],
];

describe("authApi", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        setCsrfToken(null);
        setUnauthorizedHandler(null);
    });

    afterEach(() => {
        delete global.fetch;
    });

    describe("fetchSession", () => {
        it("возвращает user и отдаёт csrfToken в apiClient", async () => {
            fetch.mockResolvedValueOnce(reply(200, { user, csrfToken: "tok" }));

            await expect(fetchSession()).resolves.toEqual(user);
            expect(fetch.mock.calls[0][0]).toBe("/api/auth/session");

            fetch.mockResolvedValueOnce(reply(204));
            await apiRequest("/api/x", { method: "POST" });
            expect(fetch.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("tok");
        });

        it("401 даёт null и не вызывает глобальный хук 401", async () => {
            const handler = jest.fn();
            setUnauthorizedHandler(handler);
            fetch.mockResolvedValue(reply(401, { error: "no" }));

            await expect(fetchSession()).resolves.toBeNull();
            expect(handler).not.toHaveBeenCalled();
        });

        it("пробрасывает signal", async () => {
            fetch.mockResolvedValue(reply(200, { user, csrfToken: "t" }));
            const { signal } = new AbortController();

            await fetchSession({ signal });

            expect(fetch.mock.calls[0][1].signal).toBe(signal);
        });

        it.each([
            ["битый JSON", "{oops"],
            ["пустое тело", undefined],
            ["без user", { csrfToken: "t" }],
            ["без csrfToken", { user }],
        ])("2xx с некорректным телом (%s) — ошибка, а не anonymous", async (_, body) => {
            fetch.mockResolvedValue(reply(200, body));

            await expect(fetchSession()).rejects.toThrow();
        });

        it("приводит user к модели SessionUser: лишние поля отбрасываются, пустые lastName и avatarUrl допустимы", async () => {
            const raw = { ...user, lastName: "", avatarUrl: "", isAdmin: true, provider: "github" };
            fetch.mockResolvedValue(reply(200, { user: raw, csrfToken: "t" }));

            await expect(fetchSession()).resolves.toEqual({ ...user, lastName: "", avatarUrl: "" });
        });

        it.each(INVALID_USERS)("user с некорректным полем (%s) — ошибка, токен не запоминается", async (_, patch) => {
            fetch.mockResolvedValueOnce(reply(200, { user: { ...user, ...patch }, csrfToken: "tok" }));

            await expect(fetchSession()).rejects.toThrow("Некорректный ответ");

            fetch.mockResolvedValueOnce(reply(204));
            await apiRequest("/api/x", { method: "POST" });
            expect(fetch.mock.calls[1][1].headers["X-CSRF-Token"]).toBeUndefined();
        });

        it("пробрасывает прочие HTTP-ошибки и сетевые сбои", async () => {
            fetch.mockResolvedValueOnce(reply(500));
            await expect(fetchSession()).rejects.toMatchObject({ status: 500 });

            fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
            await expect(fetchSession()).rejects.toThrow("Failed to fetch");
        });
    });

    describe("logout", () => {
        it("шлёт POST /api/auth/logout с CSRF-токеном и забывает токен", async () => {
            fetch.mockResolvedValueOnce(reply(200, { user, csrfToken: "tok" }));
            await fetchSession();
            fetch.mockResolvedValueOnce(reply(204));

            await logout();

            const [url, options] = fetch.mock.calls[1];
            expect(url).toBe("/api/auth/logout");
            expect(options.method).toBe("POST");
            expect(options.headers["X-CSRF-Token"]).toBe("tok");

            fetch.mockResolvedValueOnce(reply(204));
            await apiRequest("/api/x", { method: "POST" });
            expect(fetch.mock.calls[2][1].headers["X-CSRF-Token"]).toBeUndefined();
        });

        it("при ошибке пробрасывает её и не трогает токен", async () => {
            fetch.mockResolvedValueOnce(reply(200, { user, csrfToken: "tok" }));
            await fetchSession();
            fetch.mockResolvedValueOnce(reply(403));

            await expect(logout()).rejects.toMatchObject({ status: 403 });

            fetch.mockResolvedValueOnce(reply(204));
            await apiRequest("/api/x", { method: "POST" });
            expect(fetch.mock.calls[2][1].headers["X-CSRF-Token"]).toBe("tok");
        });
    });

    describe.each([
        ["login", login, "/api/auth/login", 200],
        ["register", register, "/api/auth/register", 201],
    ])("%s", (_, request, path, okStatus) => {
        const credentials = { login: "Alice", password: "correct-horse-1" };

        it(`шлёт POST ${path} с логином и паролем, возвращает user из ответа без GET /api/auth/session`, async () => {
            fetch.mockResolvedValueOnce(reply(okStatus, { user, csrfToken: "tok" }));

            await expect(request(credentials)).resolves.toEqual(user);

            expect(fetch).toHaveBeenCalledTimes(1);
            const [url, options] = fetch.mock.calls[0];
            expect(url).toBe(path);
            expect(options.method).toBe("POST");
            expect(JSON.parse(options.body)).toEqual(credentials);
        });

        it("запоминает csrfToken из ответа для следующих запросов", async () => {
            fetch.mockResolvedValueOnce(reply(okStatus, { user, csrfToken: "tok" }));
            await request(credentials);

            fetch.mockResolvedValueOnce(reply(204));
            await apiRequest("/api/x", { method: "POST" });
            expect(fetch.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("tok");
        });

        it.each([
            ["битый JSON", "{oops"],
            ["пустое тело", undefined],
            ["без user", { csrfToken: "t" }],
            ["без csrfToken", { user }],
        ])("2xx с некорректным телом (%s) — ошибка", async (_, body) => {
            fetch.mockResolvedValue(reply(okStatus, body));

            await expect(request(credentials)).rejects.toThrow();
        });

        it("приводит user к модели SessionUser: лишние поля отбрасываются", async () => {
            fetch.mockResolvedValueOnce(reply(okStatus, { user: { ...user, isAdmin: true, provider: "github" }, csrfToken: "tok" }));

            await expect(request(credentials)).resolves.toEqual(user);
        });

        it.each(INVALID_USERS)("user с некорректным полем (%s) — ошибка", async (_, patch) => {
            fetch.mockResolvedValueOnce(reply(okStatus, { user: { ...user, ...patch }, csrfToken: "tok" }));

            await expect(request(credentials)).rejects.toThrow("Некорректный ответ");
        });

        it("ошибка сервера пробрасывается как ApiError с кодом и не вызывает хук выхода", async () => {
            const handler = jest.fn();
            setUnauthorizedHandler(handler);
            fetch.mockResolvedValue(reply(401, { error: { code: "unauthorized", message: "no" } }));

            await expect(request(credentials)).rejects.toMatchObject({ status: 401, code: "unauthorized" });
            expect(handler).not.toHaveBeenCalled();
        });

        it.each([
            [400, { error: { code: "validation_failed", details: [{ field: "login", code: "required" }] } }, {}, { details: [{ field: "login", code: "required" }] }],
            [401, { error: { code: "auth_failed" } }, {}, { code: "auth_failed" }],
            [403, { error: { code: "user_disabled" } }, {}, { code: "user_disabled" }],
            [403, { error: { code: "forbidden" } }, {}, { code: "forbidden" }],
            [409, { error: { code: "login_taken" } }, {}, { code: "login_taken" }],
            [429, { error: { code: "rate_limited" } }, { "Retry-After": "30" }, { retryAfter: 30 }],
            [500, { error: { code: "internal_error" } }, {}, { code: "internal_error" }],
        ])("%i: ApiError несёт code, details и retryAfter, хук выхода не вызывается", async (status, body, headers, expected) => {
            const handler = jest.fn();
            setUnauthorizedHandler(handler);
            fetch.mockResolvedValue(reply(status, body, headers));

            await expect(request(credentials)).rejects.toMatchObject({ status, ...expected });
            expect(handler).not.toHaveBeenCalled();
        });

        it("сетевой сбой не вызывает хук выхода", async () => {
            const handler = jest.fn();
            setUnauthorizedHandler(handler);
            fetch.mockRejectedValue(new TypeError("Failed to fetch"));

            await expect(request(credentials)).rejects.toThrow(TypeError);
            expect(handler).not.toHaveBeenCalled();
        });
    });
});
