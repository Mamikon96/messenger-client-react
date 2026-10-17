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

// Сообщения чата по возрастанию seq: без курсора — последние `limit`, с `before` — ближайшие к курсору `seq < before` (§3.9).
// Ответ — голый массив ChatMessageDto, признака «есть ещё» нет.
export function fetchMessages(chatId, { before, limit, signal } = {}) {
    const query = new URLSearchParams();
    if (before !== undefined) query.set("before", before);
    if (limit !== undefined) query.set("limit", limit);
    const search = query.toString();
    return apiRequest(`/api/chats/${encodeURIComponent(chatId)}/messages${search ? `?${search}` : ""}`, { signal });
}
