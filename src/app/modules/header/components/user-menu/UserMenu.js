import { useState } from "react";
import { useDispatch } from "react-redux";
import "./UserMenu.css";
import { logout } from "../../../../reducers/auth";

export const UserMenu = () => {
    const dispatch = useDispatch();
    const [isPending, setIsPending] = useState(false);
    const [isError, setIsError] = useState(false);

    const handleLogout = async () => {
        setIsPending(true);
        setIsError(false);
        const result = await dispatch(logout());
        // при успехе store сброшен и меню размонтировано — состояние трогаем только при ошибке
        if (logout.rejected.match(result)) {
            setIsPending(false);
            setIsError(true);
        }
    }

    return (
        <div className="user-menu">
            <button className="user-menu__logout" type="button" disabled={isPending} onClick={handleLogout}>Выйти</button>
            {isError && <p className="user-menu__error" role="alert">Не удалось выйти. Попробуйте снова.</p>}
        </div>
    );
};
