import { useCallback, useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { markChatRead } from "../../reducers/chats";

// Пауза перед отправкой: прокрутка и пачка сообщений дают один запрос.
export const READ_DEBOUNCE_MS = 300;

// Отметка чата прочитанным (POST /api/chats/:id/read): max загруженный seq уходит, когда лента прокручена до низа и вкладка видна.
// enabled — серверный чат с загруженной историей; lastSeq — max загруженный seq; atBottomRef — лента у низа (ведёт Dialog).
// Возвращает notify: вызвать, когда лента могла оказаться у низа (прокрутка). Сам хук запускает отправку при смене чата,
// росте lastSeq и возвращении на вкладку. Уже отправленный seq чата повторно не уходит; после ошибки отправка повторяется при следующем сигнале.
export function useReadReceipts({ chatId, lastSeq, enabled, atBottomRef }) {
    const dispatch = useDispatch();
    const timerRef = useRef(null);
    const sentRef = useRef({ chatId: null, seq: 0 });

    const notify = useCallback(() => {
        clearTimeout(timerRef.current);
        if (!enabled || !lastSeq) return;
        timerRef.current = setTimeout(() => {
            if (document.visibilityState !== "visible" || !atBottomRef.current) return;
            const sent = sentRef.current;
            if (sent.chatId === chatId && sent.seq >= lastSeq) return;
            const previous = sent;
            sentRef.current = { chatId, seq: lastSeq };
            dispatch(markChatRead({ chatId, seq: lastSeq })).then((action) => {
                if (markChatRead.rejected.match(action) && sentRef.current.chatId === chatId && sentRef.current.seq === lastSeq) sentRef.current = previous;
            });
        }, READ_DEBOUNCE_MS);
    }, [chatId, lastSeq, enabled, atBottomRef, dispatch]);

    useEffect(() => {
        notify();
        return () => clearTimeout(timerRef.current);
    }, [notify]);

    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === "visible") notify();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [notify]);

    return notify;
}
