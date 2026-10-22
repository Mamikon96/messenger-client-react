import { searchUsers } from "./usersApi";
import { setUnauthorizedHandler } from "./apiClient";

const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
});

describe("usersApi", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        setUnauthorizedHandler(null);
    });

    afterEach(() => {
        delete global.fetch;
    });

    it("searchUsers шлёт GET /api/users?q= и возвращает тело ответа как есть", async () => {
        const users = [{ id: "u2", name: "Bob", avatarUrl: "" }];
        fetch.mockResolvedValueOnce(reply(200, users));

        await expect(searchUsers("Bo")).resolves.toEqual(users);

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/users?q=Bo");
        expect(options.method).toBe("GET");
    });

    it("кодирует q и передаёт limit, если он задан", async () => {
        fetch.mockResolvedValue(reply(200, []));

        await searchUsers("Анна & Ко", { limit: 5 });

        const url = new URL(fetch.mock.calls[0][0], "http://localhost");
        expect(url.pathname).toBe("/api/users");
        expect(url.searchParams.get("q")).toBe("Анна & Ко");
        expect(url.searchParams.get("limit")).toBe("5");
    });

    it("пробрасывает signal", async () => {
        fetch.mockResolvedValue(reply(200, []));
        const { signal } = new AbortController();

        await searchUsers("Bo", { signal });

        expect(fetch.mock.calls[0][1].signal).toBe(signal);
    });

    it("ошибка ответа отклоняет промис с ApiError", async () => {
        fetch.mockResolvedValueOnce(reply(429, { error: { code: "rate_limited" } }));

        await expect(searchUsers("Bo")).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    });
});

describe("usersApi: проверка формы ответа", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        setUnauthorizedHandler(null);
    });

    afterEach(() => {
        delete global.fetch;
    });

    it("name с неверным типом даёт ошибку запроса, как сбой сети", async () => {
        fetch.mockResolvedValueOnce(reply(200, [{ id: "u2", name: 42, avatarUrl: "" }]));

        await expect(searchUsers("Bo")).rejects.toThrow("Некорректный ответ GET /api/users");
    });

    it.each([
        ["не массив", { id: "u2", name: "Bob", avatarUrl: "" }],
        ["элемент не объект", [null]],
        ["нет id", [{ name: "Bob", avatarUrl: "" }]],
        ["пустой id", [{ id: "", name: "Bob", avatarUrl: "" }]],
        ["нет avatarUrl", [{ id: "u2", name: "Bob" }]],
        ["один битый среди валидных", [{ id: "u2", name: "Bob", avatarUrl: "" }, { id: "u3", name: null, avatarUrl: "" }]],
    ])("отклоняет ответ: %s", async (_title, body) => {
        fetch.mockResolvedValueOnce(reply(200, body));

        await expect(searchUsers("Bo")).rejects.toThrow("Некорректный ответ");
    });

    it("пустое name и пустой список допустимы", async () => {
        fetch.mockResolvedValueOnce(reply(200, [{ id: "u2", name: "", avatarUrl: "" }])).mockResolvedValueOnce(reply(200, []));

        await expect(searchUsers("a")).resolves.toHaveLength(1);
        await expect(searchUsers("b")).resolves.toEqual([]);
    });
});
