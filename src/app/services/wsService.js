// Клиент WebSocket (docs/client-integration.md, §5): подключение, разбор кадров, коды закрытия и переподключение с backoff.
// Не знает о store: всё общение с приложением — через колбэки. Таймеры, сокет и random подставляются снаружи (тесты).
export const BACKOFF_BASE_MS = 1000
export const BACKOFF_MAX_MS = 30000

const CODE_DISPLACED = 4008
const CODE_UNAUTHORIZED = 4401
const CODE_ABNORMAL = 1006
const CODE_NORMAL = 1000

const parseFrame = (data) => {
    try {
        const frame = JSON.parse(data)
        return frame && typeof frame === 'object' && typeof frame.type === 'string' ? frame : null
    } catch {
        return null
    }
}

// Статусы: connecting, open, reconnecting (ждём повтора), displaced (4008, без автоповтора), closed.
export function createWsService({ url, createSocket, setTimer, clearTimer, random, onFrame, onStatus, onSessionClosed, checkSession }) {
    let socket = null
    let retryTimer = null
    let attempt = 0
    // Растёт при каждом открытии и закрытии: отложенные действия устаревшего поколения (проверка сессии) отбрасываются.
    let generation = 0

    const cancelRetry = () => {
        if (retryTimer === null) return
        clearTimer(retryTimer)
        retryTimer = null
    }

    const scheduleReconnect = () => {
        onStatus('reconnecting')
        const delay = random() * Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt)
        attempt += 1
        retryTimer = setTimer(() => {
            retryTimer = null
            open()
        }, delay)
    }

    // 401 по WS не отличает «сессию закрыли» от «сокет не открылся»: решает запрос сессии.
    const verifySession = () => {
        const current = generation
        onStatus('reconnecting')
        checkSession().then(
            (user) => {
                if (current !== generation) return
                if (user) {
                    scheduleReconnect()
                } else {
                    onStatus('closed')
                    onSessionClosed()
                }
            },
            () => {
                if (current === generation) scheduleReconnect()
            }
        )
    }

    // opened — открывался ли именно этот сокет: обрыв 1006 до его open — возможно, нет сессии (проверяем), после — потеря связи.
    const handleClose = (code, opened) => {
        if (code === CODE_DISPLACED) {
            onStatus('displaced')
        } else if (code === CODE_UNAUTHORIZED || (code === CODE_ABNORMAL && !opened)) {
            verifySession()
        } else {
            scheduleReconnect()
        }
    }

    function open() {
        generation += 1
        onStatus('connecting')
        const current = createSocket(url)
        socket = current
        let opened = false
        current.onopen = () => {
            if (socket !== current) return
            opened = true
            attempt = 0
            onStatus('open')
        }
        current.onmessage = (event) => {
            if (socket !== current) return
            const frame = parseFrame(event.data)
            if (frame) onFrame(frame)
        }
        current.onclose = (event) => {
            if (socket !== current) return
            socket = null
            handleClose(event.code, opened)
        }
    }

    return {
        connect() {
            if (socket) return
            cancelRetry()
            open()
        },
        close() {
            generation += 1
            cancelRetry()
            attempt = 0
            const current = socket
            socket = null
            current?.close(CODE_NORMAL)
            onStatus('closed')
        },
    }
}
