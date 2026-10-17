// Лимит длины сообщения сервера (docs/client-integration.md) считается в кодовых точках, а не в единицах UTF-16.
export const MAX_MESSAGE_LENGTH = 4000;

export function messageLength(text) {
    return [...text].length;
}
