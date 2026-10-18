import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./UserMenu.css";
import { logout, selectAuthUser } from "../../../../reducers/auth";
import { pauseRealtime, resumeRealtime, selectRealtimeStatus } from "../../../../reducers/realtime";
import { Avatar } from "../../../ui/avatar/Avatar";
import { Button } from "../../../ui/button/Button";
import { ThemeSwitch } from "./ThemeSwitch";

export const UserMenu = () => {
    const dispatch = useDispatch();
    const user = useSelector(selectAuthUser);
    const realtimeStatus = useSelector(selectRealtimeStatus);
    const [isOpen, setIsOpen] = useState(false);
    // статус выхода: idle | pending | error
    const [logoutStatus, setLogoutStatus] = useState("idle");
    const dropdownId = useId();
    const rootRef = useRef(null);
    const triggerRef = useRef(null);

    // ошибка выхода относится к одному показу меню; идущий выход (pending) не сбрасываем
    const resetError = useCallback(() => setLogoutStatus((status) => (status === "error" ? "idle" : status)), []);

    const close = useCallback(() => {
        setIsOpen(false);
        resetError();
    }, [resetError]);

    const open = () => {
        // ошибка могла прийти, пока меню было закрыто
        resetError();
        setIsOpen(true);
    };

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key !== "Escape") return;
            close();
            triggerRef.current?.focus();
        };
        const handlePointerDown = (event) => {
            if (!rootRef.current?.contains(event.target)) close();
        };
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("mousedown", handlePointerDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("mousedown", handlePointerDown);
        };
    }, [isOpen, close]);

    const handleLogout = async () => {
        setLogoutStatus("pending");
        dispatch(pauseRealtime());
        const result = await dispatch(logout());
        // при успехе store сброшен и меню размонтировано — состояние трогаем только при ошибке
        if (logout.rejected.match(result)) {
            // вытесненный (4008) или уже закрытый сокет сам не оживает: подключение остаётся ручным
            if (realtimeStatus !== 'displaced' && realtimeStatus !== 'closed') dispatch(resumeRealtime());
            setLogoutStatus("error");
        }
    }

    return (
        <div className="user-menu" ref={rootRef}>
            <button
                ref={triggerRef}
                type="button"
                className="user-menu__trigger"
                aria-expanded={isOpen}
                aria-controls={dropdownId}
                onClick={() => (isOpen ? close() : open())}
            >
                <span aria-hidden="true">
                    <Avatar size="sm" id={user?.id} name={user?.name} src={user?.avatarUrl} />
                </span>
                <span className="user-menu__name">{user?.name}</span>
            </button>
            {isOpen && (
                <div id={dropdownId} className="user-menu__dropdown">
                    <ThemeSwitch />
                    <Button className="user-menu__logout" variant="secondary" loading={logoutStatus === "pending"} onClick={handleLogout}>Выйти</Button>
                    {logoutStatus === "error" && <p className="user-menu__error" role="alert">Не удалось выйти. Попробуйте снова.</p>}
                </div>
            )}
        </div>
    );
};
