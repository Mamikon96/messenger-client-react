import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./UserMenu.css";
import { logout } from "../../../../reducers/auth";
import { pauseRealtime, resumeRealtime, selectRealtimeStatus } from "../../../../reducers/realtime";
import { Button } from "../../../ui/button/Button";

export const UserMenu = () => {
    const dispatch = useDispatch();
    const [isPending, setIsPending] = useState(false);
    const [isError, setIsError] = useState(false);
    const realtimeStatus = useSelector(selectRealtimeStatus);

    const handleLogout = async () => {
        setIsPending(true);
        setIsError(false);
        dispatch(pauseRealtime());
        const result = await dispatch(logout());
        // при успехе store сброшен и меню размонтировано — состояние трогаем только при ошибке
        if (logout.rejected.match(result)) {
            // вытесненный (4008) или уже закрытый сокет сам не оживает: подключение остаётся ручным
            if (realtimeStatus !== 'displaced' && realtimeStatus !== 'closed') dispatch(resumeRealtime());
            setIsPending(false);
            setIsError(true);
        }
    }

    return (
        <div className="user-menu">
            <Button className="user-menu__logout" variant="secondary" loading={isPending} onClick={handleLogout}>Выйти</Button>
            {isError && <p className="user-menu__error" role="alert">Не удалось выйти. Попробуйте снова.</p>}
        </div>
    );
};
