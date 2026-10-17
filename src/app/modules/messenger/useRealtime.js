import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { startRealtime } from "../../reducers/realtime";

// WebSocket живёт, пока показан мессенджер: запуск при монтировании, закрытие при размонтировании (выход, закрытая сессия).
export function useRealtime() {
    const dispatch = useDispatch();

    useEffect(() => dispatch(startRealtime()), [dispatch]);
}
