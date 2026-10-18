import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { nudgeRealtime, startRealtime } from "../../reducers/realtime";

// WebSocket живёт, пока показан мессенджер: запуск при монтировании, закрытие при размонтировании (выход, закрытая сессия).
// Возвращение сети и показ вкладки торопят повтор подключения, если сокет ждёт backoff.
export function useRealtime() {
    const dispatch = useDispatch();

    useEffect(() => dispatch(startRealtime()), [dispatch]);

    useEffect(() => {
        const nudge = () => dispatch(nudgeRealtime());
        const onVisibility = () => {
            if (document.visibilityState === "visible") nudge();
        };
        window.addEventListener("online", nudge);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("online", nudge);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [dispatch]);
}
