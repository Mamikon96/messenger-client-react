import { deleteChatMember, fetchChat, fetchChats, fetchMessages, patchChat, postChatMember, postDirectChat, postGroupChat, postMessage, postRead } from "./chatsApi";
import { setUnauthorizedHandler } from "./apiClient";

const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
});

const EMPTY_PAGE = { messages: [], hasMore: false };
const EMPTY_CHAT = { id: "c1", type: "group", title: "Team", lastSeq: 0, members: [] };

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
        const page = { messages: [{ chatId: "c1", seq: 1, senderId: "u1", clientId: "k1", body: "hi", createdAt: "2026-10-15T10:00:00.000Z" }], hasMore: true };
        fetch.mockResolvedValueOnce(reply(200, page));

        await expect(fetchMessages("c1")).resolves.toEqual(page);

        expect(fetch.mock.calls[0][0]).toBe("/api/chats/c1/messages");
    });

    it("fetchMessages передаёт before и limit в query", async () => {
        fetch.mockResolvedValueOnce(reply(200, EMPTY_PAGE));

        await fetchMessages("c1", { before: 51, limit: 50 });

        expect(fetch.mock.calls[0][0]).toBe("/api/chats/c1/messages?before=51&limit=50");
    });

    it("fetchMessages передаёт since в query (догонка после пропуска seq)", async () => {
        fetch.mockResolvedValueOnce(reply(200, EMPTY_PAGE));

        await fetchMessages("c1", { since: 7, limit: 100 });

        expect(fetch.mock.calls[0][0]).toBe("/api/chats/c1/messages?since=7&limit=100");
    });

    it("fetchChat и fetchMessages пробрасывают signal", async () => {
        fetch.mockResolvedValueOnce(reply(200, EMPTY_CHAT)).mockResolvedValueOnce(reply(200, EMPTY_PAGE));
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
        fetch.mockResolvedValue(reply(201, { chatId: "c1", seq: 1, senderId: "u1", clientId: "k1", body: "hi", createdAt: "2026-10-15T10:00:00.000Z" }));
        const { signal } = new AbortController();

        await postMessage("c1", { clientId: "k1", body: "hi", signal });

        expect(fetch.mock.calls[0][1].signal).toBe(signal);
    });

    it("postRead шлёт POST /api/chats/:id/read с seq и пробрасывает signal; ответ 204 принимается", async () => {
        fetch.mockResolvedValueOnce(reply(204));
        const { signal } = new AbortController();

        await postRead("c 1", { seq: 7, signal });

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/chats/c%201/read");
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body)).toEqual({ seq: 7 });
        expect(options.signal).toBe(signal);
    });

    it("postChatMember шлёт POST /api/chats/:id/members с userId и принимает 204; 409 приходит как ApiError", async () => {
        fetch.mockResolvedValueOnce(reply(204)).mockResolvedValueOnce(reply(409, { error: { code: "already_member" } }));
        const { signal } = new AbortController();

        await postChatMember("c 1", "u2", { signal });

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/chats/c%201/members");
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body)).toEqual({ userId: "u2" });
        expect(options.signal).toBe(signal);
        await expect(postChatMember("c1", "u2")).rejects.toMatchObject({ status: 409, code: "already_member" });
    });

    it("patchChat шлёт PATCH /api/chats/:id с title и возвращает ChatDto; 403 приходит как ApiError", async () => {
        const dto = { id: "c 1", type: "group", title: "New", lastSeq: 0, members: [] };
        fetch.mockResolvedValueOnce(reply(200, dto)).mockResolvedValueOnce(reply(403, { error: { code: "forbidden" } }));
        const { signal } = new AbortController();

        await expect(patchChat("c 1", "New", { signal })).resolves.toEqual(dto);

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/chats/c%201");
        expect(options.method).toBe("PATCH");
        expect(JSON.parse(options.body)).toEqual({ title: "New" });
        expect(options.signal).toBe(signal);
        await expect(patchChat("c1", "New")).rejects.toMatchObject({ status: 403, code: "forbidden" });
    });

    it("deleteChatMember шлёт DELETE /api/chats/:id/members/:userId и принимает 204; 404 приходит как ApiError", async () => {
        fetch.mockResolvedValueOnce(reply(204)).mockResolvedValueOnce(reply(404, { error: { code: "not_found" } }));
        const { signal } = new AbortController();

        await deleteChatMember("c 1", "u/2", { signal });

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/chats/c%201/members/u%2F2");
        expect(options.method).toBe("DELETE");
        expect(options.body).toBeUndefined();
        expect(options.signal).toBe(signal);
        await expect(deleteChatMember("c1", "u2")).rejects.toMatchObject({ status: 404, code: "not_found" });
    });

    it("postDirectChat шлёт POST /api/chats с type direct и userId и возвращает ChatDto (201 и 200)", async () => {
        const dto = { id: "d1", type: "direct", title: null, lastSeq: 0, members: [] };
        fetch.mockResolvedValueOnce(reply(201, dto)).mockResolvedValueOnce(reply(200, dto));

        await expect(postDirectChat("u2")).resolves.toEqual(dto);
        await expect(postDirectChat("u2")).resolves.toEqual(dto);

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/chats");
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body)).toEqual({ type: "direct", userId: "u2" });
    });

    it("postDirectChat пробрасывает signal; 404 — ApiError", async () => {
        const { signal } = new AbortController();
        fetch.mockResolvedValueOnce(reply(201, EMPTY_CHAT)).mockResolvedValueOnce(reply(404, { error: { code: "not_found" } }));

        await postDirectChat("u2", { signal });
        expect(fetch.mock.calls[0][1].signal).toBe(signal);

        await expect(postDirectChat("u3")).rejects.toMatchObject({ status: 404, code: "not_found" });
    });

    it("postGroupChat шлёт POST /api/chats с type group, title и пустым memberIds и возвращает ChatDto", async () => {
        const dto = { id: "g1", type: "group", title: "Team", lastSeq: 0, members: [] };
        fetch.mockResolvedValueOnce(reply(201, dto));

        await expect(postGroupChat("Team")).resolves.toEqual(dto);

        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("/api/chats");
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body)).toEqual({ type: "group", title: "Team", memberIds: [] });
    });

    it("postGroupChat пробрасывает signal; 400 — ApiError", async () => {
        const { signal } = new AbortController();
        fetch.mockResolvedValueOnce(reply(201, EMPTY_CHAT)).mockResolvedValueOnce(reply(400, { error: { code: "validation_failed" } }));

        await postGroupChat("Team", { signal });
        expect(fetch.mock.calls[0][1].signal).toBe(signal);

        await expect(postGroupChat(" ")).rejects.toMatchObject({ status: 400, code: "validation_failed" });
    });
});

describe("chatsApi: проверка формы ответа", () => {
    const member = { userId: "u1", name: "Ann", avatarUrl: "", role: "owner" };
    const message = { chatId: "c1", seq: 1, senderId: "u1", clientId: "k1", body: "hi", createdAt: "2026-10-15T10:00:00.000Z" };
    const chatDto = { id: "c1", type: "group", title: "Team", lastSeq: 1, members: [member] };
    const listItem = { id: "c1", type: "group", title: "Team", lastSeq: 1, lastMessage: message, unreadCount: 0 };
    const directItem = { id: "d1", type: "direct", title: null, lastSeq: 0, lastMessage: null, unreadCount: 0, peer: { id: "u2", name: "Bob", avatarUrl: "" } };

    beforeEach(() => {
        global.fetch = jest.fn();
        setUnauthorizedHandler(null);
    });

    afterEach(() => {
        delete global.fetch;
    });

    it("валидные ответы возвращаются как есть", async () => {
        fetch
            .mockResolvedValueOnce(reply(200, [listItem, directItem]))
            .mockResolvedValueOnce(reply(200, chatDto))
            .mockResolvedValueOnce(reply(200, { messages: [message], hasMore: false }))
            .mockResolvedValueOnce(reply(201, message));

        await expect(fetchChats()).resolves.toEqual([listItem, directItem]);
        await expect(fetchChat("c1")).resolves.toEqual(chatDto);
        await expect(fetchMessages("c1")).resolves.toEqual({ messages: [message], hasMore: false });
        await expect(postMessage("c1", { clientId: "k1", body: "hi" })).resolves.toEqual(message);
    });

    it.each([
        ["fetchChats", () => fetchChats(), "GET /api/chats", [{ ...listItem, title: 42 }]],
        ["fetchChat", () => fetchChat("c1"), "GET /api/chats/:id", { ...chatDto, members: [{ ...member, name: 42 }] }],
        ["fetchMessages", () => fetchMessages("c1"), "GET /api/chats/:id/messages", { messages: [{ ...message, body: 42 }], hasMore: false }],
        ["postMessage", () => postMessage("c1", { clientId: "k1", body: "hi" }), "POST /api/chats/:id/messages", { ...message, seq: "1" }],
        ["postDirectChat", () => postDirectChat("u2"), "POST /api/chats", { ...chatDto, type: "channel" }],
        ["postGroupChat", () => postGroupChat("Team"), "POST /api/chats", { ...chatDto, id: 7 }],
        ["patchChat", () => patchChat("c1", "New"), "PATCH /api/chats/:id", { ...chatDto, members: null }],
    ])("%s: поле неверного типа даёт ошибку запроса", async (_name, call, endpoint, body) => {
        fetch.mockResolvedValueOnce(reply(200, body));

        await expect(call()).rejects.toThrow(`Некорректный ответ ${endpoint}`);
    });

    it.each([
        ["список чатов не массив", () => fetchChats(), {}],
        ["peer без name", () => fetchChats(), [{ ...directItem, peer: { id: "u2", avatarUrl: "" } }]],
        ["lastMessage неверной формы", () => fetchChats(), [{ ...listItem, lastMessage: { seq: 1 } }]],
        ["unreadCount не число", () => fetchChats(), [{ ...listItem, unreadCount: "0" }]],
        ["один битый среди валидных", () => fetchChats(), [listItem, { ...listItem, id: null }]],
        ["роль участника вне перечня", () => fetchChat("c1"), { ...chatDto, members: [{ ...member, role: "admin" }] }],
        ["messages не массив", () => fetchMessages("c1"), { messages: {}, hasMore: false }],
        ["hasMore не boolean", () => fetchMessages("c1"), { messages: [], hasMore: "no" }],
        ["пустой ответ", () => postMessage("c1", { clientId: "k1", body: "hi" }), {}],
    ])("отклоняет: %s", async (_title, call, body) => {
        fetch.mockResolvedValueOnce(reply(200, body));

        await expect(call()).rejects.toThrow("Некорректный ответ");
    });

    it("direct с title null, пустое body и пустое name допустимы", async () => {
        const direct = { ...chatDto, type: "direct", title: null, members: [{ ...member, name: "" }] };
        fetch.mockResolvedValueOnce(reply(200, direct)).mockResolvedValueOnce(reply(200, { ...message, body: "" }));

        await expect(fetchChat("d1")).resolves.toEqual(direct);
        await expect(postMessage("d1", { clientId: "k1", body: "" })).resolves.toMatchObject({ body: "" });
    });
});
