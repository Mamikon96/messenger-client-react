import { fetchSession, logout } from "./authApi";
import { apiRequest, setCsrfToken, setUnauthorizedHandler } from "./apiClient";

const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body)),
});

const user = { id: "1", name: "Ann", avatarUrl: "http://a/b.png", provider: "github" };

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
});
