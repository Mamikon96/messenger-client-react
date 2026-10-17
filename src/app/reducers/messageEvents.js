import { createAction } from '@reduxjs/toolkit'

// Событие: сообщение с известным seq попало в чат (ChatMessageDto, раздел 4 docs/client-integration.md).
// Лежит отдельно от слайсов, чтобы chats и messages обрабатывали его без импорта друг друга.
// meta.unread — сообщение чужое и пришло в неоткрытый чат (по WS): chats увеличивает unreadCount.
export const messageAdded = createAction('messages/messageAdded', (message, { unread = false } = {}) => ({
    payload: message,
    meta: { unread },
}))

// Событие: чат исчез у пользователя (chat.removed): слайсы убирают всё, что к нему относится.
export const chatRemoved = createAction('chats/chatRemoved')
