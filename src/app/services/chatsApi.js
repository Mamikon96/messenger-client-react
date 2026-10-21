import { apiRequest } from "./apiClient";

// Мои чаты в порядке сервера (по убыванию активности): ChatListItemDto[] (docs/client-integration.md, §3.2).
// 401 unauthorized обрабатывает apiClient (sessionClosed).
export function fetchChats({ signal } = {}) {
    return apiRequest("/api/chats", { signal });
}

// Карточка чата с участниками: ChatDto (docs/client-integration.md, §3.4).
export function fetchChat(chatId, { signal } = {}) {
    return apiRequest(`/api/chats/${encodeURIComponent(chatId)}`, { signal });
}

// Сообщения чата по возрастанию seq: без курсора — последние `limit`, с `before` — ближайшие к курсору `seq < before`, с `since` — следующие за `seq > since` (§3.9).
// Ответ как есть: { messages: ChatMessageDto[], hasMore: boolean }; hasMore — есть ли ещё сообщения за страницей в направлении запроса.
export function fetchMessages(chatId, { before, since, limit, signal } = {}) {
    const query = new URLSearchParams();
    if (before !== undefined) query.set("before", before);
    if (since !== undefined) query.set("since", since);
    if (limit !== undefined) query.set("limit", limit);
    const search = query.toString();
    return apiRequest(`/api/chats/${encodeURIComponent(chatId)}/messages${search ? `?${search}` : ""}`, { signal });
}

// Отправка сообщения: ChatMessageDto (201 — создано, 200 — повтор с тем же clientId; §3.8).
export function postMessage(chatId, { clientId, body, signal } = {}) {
    return apiRequest(`/api/chats/${encodeURIComponent(chatId)}/messages`, { method: "POST", body: { clientId, body }, signal });
}

// Direct-чат с пользователем: ChatDto (201 — создан, 200 — уже существовал).
export function postDirectChat(userId, { signal } = {}) {
    return apiRequest("/api/chats", { method: "POST", body: { type: "direct", userId }, signal });
}

// Группа без участников, кроме создателя (он owner): ChatDto (201; §3.3). 400 validation_failed — название не подходит (details у чатов нет).
export function postGroupChat(title, { signal } = {}) {
    return apiRequest("/api/chats", { method: "POST", body: { type: "group", title, memberIds: [] }, signal });
}

// Отметка о прочтении: last_read_seq = max(текущий, seq) (204 без тела; 400 — seq больше lastSeq чата; §3.10). Событий о прочтении нет.
export function postRead(chatId, { seq, signal } = {}) {
    return apiRequest(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: "POST", body: { seq }, signal });
}
