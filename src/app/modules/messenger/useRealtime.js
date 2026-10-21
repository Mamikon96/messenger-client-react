import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { nudgeRealtime, reconcileRealtime, startRealtime } from "../../reducers/realtime";

const RECONCILE_DEDUPE_MS = 1000;

// WebSocket живёт, пока показан мессенджер: запуск при монтировании, закрытие при размонтировании (выход, закрытая сессия).
// Возвращение сети и показ вкладки торопят повтор подключения, если сокет ждёт backoff; показ вкладки и фокус окна сверяют список чатов.
export function useRealtime() {
    const dispatch = useDispatch();

    useEffect(() => dispatch(startRealtime()), [dispatch]);

    useEffect(() => {
        const nudge = () => dispatch(nudgeRealtime());
        let lastReconcileAt = -Infinity;
        // visibilitychange и focus приходят вместе; второй reconcile отменил бы первый, поэтому повтор в окне пропускается.
        const reconcile = () => {
            const now = Date.now();
            if (now - lastReconcileAt < RECONCILE_DEDUPE_MS) return;
            lastReconcileAt = now;
            dispatch(reconcileRealtime());
        };
        const onVisibility = () => {
            if (document.visibilityState !== "visible") return;
            nudge();
            reconcile();
        };
        window.addEventListener("online", nudge);
        window.addEventListener("focus", reconcile);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("online", nudge);
            window.removeEventListener("focus", reconcile);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [dispatch]);
}
