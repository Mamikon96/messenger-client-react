const toHex = (byte) => byte.toString(16).padStart(2, '0')

// UUID v4 из случайных байтов: запасной вариант, если у окружения нет crypto.randomUUID (FE-D15(11)).
const uuidFromRandomValues = () => {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, toHex).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Клиентский идентификатор (UUID v4): id локально созданных сущностей и clientId сообщений.
export const createClientId = () =>
    typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : uuidFromRandomValues()
