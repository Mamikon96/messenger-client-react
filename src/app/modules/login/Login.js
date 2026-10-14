import { useEffect, useId, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import "./Login.css";
import { Button } from "../ui/button/Button";
import { Input } from "../ui/input/Input";
import { login, register } from "../../reducers/auth";
import { ProviderIcon } from "./ProviderIcon";
import { PROVIDERS } from "./providers";

const MODES = {
    login: { tab: "Вход", submit: "Войти", passwordAutoComplete: "current-password", action: login },
    register: { tab: "Регистрация", submit: "Зарегистрироваться", passwordAutoComplete: "new-password", action: register },
};

const MODE_IDS = Object.keys(MODES);

// Общее сообщение для любой ошибки входа и регистрации; тексты по кодам ошибок — FE-91.
const SUBMIT_ERROR = "Не удалось войти. Попробуйте ещё раз.";

// Клик, который не уводит текущую вкладку (новая вкладка/окно по модификатору или средней кнопке).
const isPlainClick = (event) =>
    !event.defaultPrevented && event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);

// Форма логина и пароля (FE-D38). Ссылки OAuth остаются до FE-90: вход по ним — полная навигация браузера на BFF,
// error — готовый текст ошибки OAuth (FE-D11).
export default function Login({ error }) {
    const dispatch = useDispatch();
    const [mode, setMode] = useState("login");
    const [credentials, setCredentials] = useState({ login: "", password: "" });
    const [submitError, setSubmitError] = useState(null);
    const [pendingId, setPendingId] = useState(null);
    const tabRefs = useRef({});
    const idPrefix = useId();
    const current = MODES[mode];
    const tabId = (id) => `${idPrefix}-tab-${id}`;
    const panelId = `${idPrefix}-panel`;

    // Возврат кнопкой «назад» из bfcache показывает страницу с прежним состоянием — сбрасываем «Переход…».
    useEffect(() => {
        const handlePageShow = (event) => {
            if (event.persisted) setPendingId(null);
        };
        window.addEventListener("pageshow", handlePageShow);
        return () => window.removeEventListener("pageshow", handlePageShow);
    }, []);

    const handleModeChange = (nextMode) => {
        setMode(nextMode);
        setSubmitError(null);
    };

    // Вкладки по паттерну WAI-ARIA Tabs: стрелки и Home/End выбирают режим и переводят фокус на его вкладку.
    const handleTabKeyDown = (event) => {
        const index = MODE_IDS.indexOf(mode);
        const targets = {
            ArrowRight: MODE_IDS[(index + 1) % MODE_IDS.length],
            ArrowLeft: MODE_IDS[(index - 1 + MODE_IDS.length) % MODE_IDS.length],
            Home: MODE_IDS[0],
            End: MODE_IDS[MODE_IDS.length - 1],
        };
        const nextMode = targets[event.key];
        if (!nextMode) return;
        event.preventDefault();
        handleModeChange(nextMode);
        tabRefs.current[nextMode]?.focus();
    };

    const handleChange = (event) => {
        const { name, value } = event.target;
        setCredentials((prev) => ({ ...prev, [name]: value }));
    };

    // При успехе store переходит в authenticated и App показывает мессенджер вместо этого экрана.
    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitError(null);
        try {
            await dispatch(current.action(credentials)).unwrap();
        } catch {
            setSubmitError(SUBMIT_ERROR);
        }
    };

    const message = submitError || (!pendingId && error);

    return (
        <div className="login">
            <div className="login__card">
                <h1 className="login__title">Messenger</h1>
                <p className="login__subtitle">Войдите, чтобы продолжить</p>
                <div className="login__modes" role="tablist" aria-label="Вход или регистрация">
                    {Object.entries(MODES).map(([id, { tab }]) => (
                        <button
                            key={id}
                            ref={(node) => {
                                tabRefs.current[id] = node;
                            }}
                            type="button"
                            role="tab"
                            id={tabId(id)}
                            className={["login__mode", id === mode ? "_active" : ""].filter(Boolean).join(" ")}
                            aria-selected={id === mode}
                            aria-controls={panelId}
                            tabIndex={id === mode ? 0 : -1}
                            onClick={() => handleModeChange(id)}
                            onKeyDown={handleTabKeyDown}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
                {message && <p className="login__error" role="alert">{message}</p>}
                <form
                    className="login__form"
                    role="tabpanel"
                    id={panelId}
                    aria-labelledby={tabId(mode)}
                    onSubmit={handleSubmit}
                >
                    <Input
                        label="Логин"
                        name="login"
                        autoComplete="username"
                        value={credentials.login}
                        onChange={handleChange}
                    />
                    <Input
                        label="Пароль"
                        name="password"
                        type="password"
                        autoComplete={current.passwordAutoComplete}
                        value={credentials.password}
                        onChange={handleChange}
                    />
                    <Button type="submit" className="login__submit">{current.submit}</Button>
                </form>
                <div className="login__providers">
                    {PROVIDERS.map(({ id, name }) => (
                        <Button
                            key={id}
                            href={`/api/auth/${id}/start`}
                            variant="secondary"
                            className="login__provider"
                            loading={pendingId === id}
                            disabled={pendingId !== null && pendingId !== id}
                            aria-label={pendingId === id ? `Переход… (${name})` : undefined}
                            onClick={(event) => {
                                if (isPlainClick(event)) setPendingId(id);
                            }}
                        >
                            {pendingId === id ? "Переход…" : (
                                <>
                                    <ProviderIcon id={id} />
                                    {`Войти через ${name}`}
                                </>
                            )}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    );
}
