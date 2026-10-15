import { fetchChats } from "./chatsApi";
import { setUnauthorizedHandler } from "./apiClient";

const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
});

describe("chatsApi", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        setUnauthorizedHandler(null);
    });

    afterEach(() => {
        delete global.fetch;
    });

    it("fetchChats шлёт GET /api/chats и возвращает тело ответа как есть", async () => {
        const chats = [{ id: "c1", type: "group", title: "Team", lastSeq: 0, lastMessage: null, unreadCount: 0 }];
        fetch.mockResolvedValueOnce(reply(200, chats));

        await expect(fetchChats()).resolves.toEqual(chats);

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/chats");
        expect(options.method).toBe("GET");
    });

    it("пробрасывает signal", async () => {
        fetch.mockResolvedValue(reply(200, []));
        const { signal } = new AbortController();

        await fetchChats({ signal });

        expect(fetch.mock.calls[0][1].signal).toBe(signal);
    });

    it("401 unauthorized вызывает хук закрытой сессии и пробрасывает ApiError", async () => {
        const handler = jest.fn();
        setUnauthorizedHandler(handler);
        fetch.mockResolvedValue(reply(401, { error: { code: "unauthorized", message: "no" } }));

        await expect(fetchChats()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("прочие ошибки и сетевые сбои пробрасываются", async () => {
        fetch.mockResolvedValueOnce(reply(500, { error: { code: "internal_error", message: "x" } }));
        await expect(fetchChats()).rejects.toMatchObject({ status: 500 });

        fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        await expect(fetchChats()).rejects.toThrow("Failed to fetch");
    });
});
