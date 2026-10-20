import { fetchChat, fetchChats, fetchMessages, postMessage } from "./chatsApi";
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

describe("chatsApi: открытие чата", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        setUnauthorizedHandler(null);
    });

    afterEach(() => {
        delete global.fetch;
    });

    it("fetchChat шлёт GET /api/chats/:id и возвращает ChatDto как есть", async () => {
        const chat = { id: "c 1", type: "group", title: "Team", lastSeq: 2, members: [] };
        fetch.mockResolvedValueOnce(reply(200, chat));

        await expect(fetchChat("c 1")).resolves.toEqual(chat);

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/chats/c%201");
        expect(options.method).toBe("GET");
    });

    it("fetchMessages без параметров шлёт GET без query", async () => {
        const page = { messages: [{ chatId: "c1", seq: 1 }], hasMore: true };
        fetch.mockResolvedValueOnce(reply(200, page));

        await expect(fetchMessages("c1")).resolves.toEqual(page);

        expect(fetch.mock.calls[0][0]).toBe("/api/chats/c1/messages");
    });

    it("fetchMessages передаёт before и limit в query", async () => {
        fetch.mockResolvedValueOnce(reply(200, []));

        await fetchMessages("c1", { before: 51, limit: 50 });

        expect(fetch.mock.calls[0][0]).toBe("/api/chats/c1/messages?before=51&limit=50");
    });

    it("fetchMessages передаёт since в query (догонка после пропуска seq)", async () => {
        fetch.mockResolvedValueOnce(reply(200, []));

        await fetchMessages("c1", { since: 7, limit: 100 });

        expect(fetch.mock.calls[0][0]).toBe("/api/chats/c1/messages?since=7&limit=100");
    });

    it("fetchChat и fetchMessages пробрасывают signal", async () => {
        fetch.mockResolvedValue(reply(200, []));
        const { signal } = new AbortController();

        await fetchChat("c1", { signal });
        await fetchMessages("c1", { signal });

        expect(fetch.mock.calls[0][1].signal).toBe(signal);
        expect(fetch.mock.calls[1][1].signal).toBe(signal);
    });

    it("404 пробрасывается как ApiError", async () => {
        fetch.mockResolvedValue(reply(404, { error: { code: "not_found", message: "x" } }));

        await expect(fetchChat("c1")).rejects.toMatchObject({ status: 404, code: "not_found" });
        await expect(fetchMessages("c1")).rejects.toMatchObject({ status: 404 });
    });

    it("postMessage шлёт POST /api/chats/:id/messages с clientId и body и возвращает сообщение", async () => {
        const dto = { chatId: "c 1", seq: 3, senderId: "u1", clientId: "k1", body: "hi", createdAt: "2026-10-15T10:00:00.000Z" };
        fetch.mockResolvedValueOnce(reply(201, dto));

        await expect(postMessage("c 1", { clientId: "k1", body: "hi" })).resolves.toEqual(dto);

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/chats/c%201/messages");
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body)).toEqual({ clientId: "k1", body: "hi" });
    });

    it("postMessage пробрасывает signal", async () => {
        fetch.mockResolvedValue(reply(201, {}));
        const { signal } = new AbortController();

        await postMessage("c1", { clientId: "k1", body: "hi", signal });

        expect(fetch.mock.calls[0][1].signal).toBe(signal);
    });
});
