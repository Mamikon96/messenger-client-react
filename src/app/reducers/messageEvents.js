import { createAction } from '@reduxjs/toolkit'

// Событие: сообщение с известным seq попало в чат (ChatMessageDto, раздел 4 docs/client-integration.md).
// Лежит отдельно от слайсов, чтобы chats и messages обрабатывали его без импорта друг друга.
export const messageAdded = createAction('messages/messageAdded')
