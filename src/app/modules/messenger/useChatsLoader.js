import { useCallback, useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { fetchChats } from "../../reducers/chats";

// Загрузка списка чатов при показе мессенджера и по требованию («Повторить»). Держит один текущий запрос:
// новый запуск и размонтирование (выход, закрытая сессия) отменяют незавершённый.
export function useChatsLoader() {
    const dispatch = useDispatch();
    const requestRef = useRef(null);

    const load = useCallback(() => {
        requestRef.current?.abort();
        requestRef.current = dispatch(fetchChats());
    }, [dispatch]);

    useEffect(() => {
        load();
        return () => requestRef.current?.abort();
    }, [load]);

    return load;
}
