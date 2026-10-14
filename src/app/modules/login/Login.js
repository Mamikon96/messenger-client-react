import { useId, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import "./Login.css";
import { Button } from "../ui/button/Button";
import { Input } from "../ui/input/Input";
import { login, register } from "../../reducers/auth";

const MODES = {
    login: { tab: "Вход", submit: "Войти", passwordAutoComplete: "current-password", action: login },
    register: { tab: "Регистрация", submit: "Зарегистрироваться", passwordAutoComplete: "new-password", action: register },
};

const MODE_IDS = Object.keys(MODES);

// Общее сообщение для любой ошибки входа и регистрации; тексты по кодам ошибок — FE-91.
const SUBMIT_ERROR = "Не удалось войти. Попробуйте ещё раз.";

// Форма логина и пароля (FE-D38).
export default function Login() {
    const dispatch = useDispatch();
    const [mode, setMode] = useState("login");
    const [credentials, setCredentials] = useState({ login: "", password: "" });
    const [submitError, setSubmitError] = useState(null);
    const tabRefs = useRef({});
    const idPrefix = useId();
    const current = MODES[mode];
    const tabId = (id) => `${idPrefix}-tab-${id}`;
    const panelId = `${idPrefix}-panel`;

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
                {submitError && <p className="login__error" role="alert">{submitError}</p>}
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
            </div>
        </div>
    );
}
