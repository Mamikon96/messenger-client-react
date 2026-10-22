import { apiRequest } from "./apiClient";
import { expectShape, isChat, isChatList, isChatMessage, isMessagePage } from "./responseShape";

// Ответ неверной формы (контракт — docs/client-integration.md, §4) — Error "Некорректный ответ …", как сбой сети.
async function request(path, options, isValid, endpoint) {
    return expectShape(await apiRequest(path, options), isValid, endpoint);
}

// Мои чаты в порядке сервера (по убыванию активности): ChatListItemDto[] (docs/client-integration.md, §3.2).
// 401 unauthorized обрабатывает apiClient (sessionClosed).
export function fetchChats({ signal } = {}) {
    return request("/api/chats", { signal }, isChatList, "GET /api/chats");
}

// Карточка чата с участниками: ChatDto (docs/client-integration.md, §3.4).
export function fetchChat(chatId, { signal } = {}) {
    return request(`/api/chats/${encodeURIComponent(chatId)}`, { signal }, isChat, "GET /api/chats/:id");
}

// Сообщения чата по возрастанию seq: без курсора — последние `limit`, с `before` — ближайшие к курсору `seq < before`, с `since` — следующие за `seq > since` (§3.9).
// Ответ как есть: { messages: ChatMessageDto[], hasMore: boolean }; hasMore — есть ли ещё сообщения за страницей в направлении запроса.
export function fetchMessages(chatId, { before, since, limit, signal } = {}) {
    const query = new URLSearchParams();
    if (before !== undefined) query.set("before", before);
    if (since !== undefined) query.set("since", since);
    if (limit !== undefined) query.set("limit", limit);
    const search = query.toString();
    return request(`/api/chats/${encodeURIComponent(chatId)}/messages${search ? `?${search}` : ""}`, { signal }, isMessagePage, "GET /api/chats/:id/messages");
}

// Отправка сообщения: ChatMessageDto (201 — создано, 200 — повтор с тем же clientId; §3.8).
export function postMessage(chatId, { clientId, body, signal } = {}) {
    return request(`/api/chats/${encodeURIComponent(chatId)}/messages`, { method: "POST", body: { clientId, body }, signal }, isChatMessage, "POST /api/chats/:id/messages");
}

// Direct-чат с пользователем: ChatDto (201 — создан, 200 — уже существовал).
export function postDirectChat(userId, { signal } = {}) {
    return request("/api/chats", { method: "POST", body: { type: "direct", userId }, signal }, isChat, "POST /api/chats");
}

// Группа без участников, кроме создателя (он owner): ChatDto (201; §3.3). 400 validation_failed — название не подходит (details у чатов нет).
export function postGroupChat(title, { signal } = {}) {
    return request("/api/chats", { method: "POST", body: { type: "group", title, memberIds: [] }, signal }, isChat, "POST /api/chats");
}

// Добавить участника в группу (204 без тела; §3.5). 400 — лимит участников, 403 — не owner, 404 — нет чата или человека, 409 already_member — уже в группе.
export function postChatMember(chatId, userId, { signal } = {}) {
    return apiRequest(`/api/chats/${encodeURIComponent(chatId)}/members`, { method: "POST", body: { userId }, signal });
}

// Переименовать группу: ChatDto (200; §3.5). 400 — название не подходит, 403 — не owner, 404 — нет чата или вы не участник.
export function patchChat(chatId, title, { signal } = {}) {
    return request(`/api/chats/${encodeURIComponent(chatId)}`, { method: "PATCH", body: { title }, signal }, isChat, "PATCH /api/chats/:id");
}

// Убрать участника из группы или выйти самому, если userId — свой (204 без тела; §3.7). 403 — не owner или owner выходит сам, 404 — нет чата или участника.
export function deleteChatMember(chatId, userId, { signal } = {}) {
    return apiRequest(`/api/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}`, { method: "DELETE", signal });
}

// Отметка о прочтении: last_read_seq = max(текущий, seq) (204 без тела; 400 — seq больше lastSeq чата; §3.10). Событий о прочтении нет.
export function postRead(chatId, { seq, signal } = {}) {
    return apiRequest(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: "POST", body: { seq }, signal });
}
