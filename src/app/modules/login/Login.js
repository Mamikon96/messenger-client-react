import { useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./Login.css";
import { Button } from "../ui/button/Button";
import { Input } from "../ui/input/Input";
import { login, register, selectSessionClosed } from "../../reducers/auth";
import { validateCredentials } from "../../services/authFormValidation";
import { describeFormError, NO_ERRORS } from "./loginErrors";

const MODES = {
    login: { tab: "Вход", submit: "Войти", passwordAutoComplete: "current-password", action: login },
    register: { tab: "Регистрация", submit: "Зарегистрироваться", passwordAutoComplete: "new-password", action: register },
};

const MODE_IDS = Object.keys(MODES);
const FIELD_ORDER = ["login", "password"];

// Куда вернуть фокус после ошибки: первое поле с ошибкой, а при общей ошибке — кнопка отправки.
const focusTargetFor = ({ fields }) => FIELD_ORDER.find((name) => name in fields) ?? "submit";

// Форма логина и пароля (FE-D38).
export default function Login() {
    const dispatch = useDispatch();
    const sessionClosed = useSelector(selectSessionClosed);
    const [mode, setMode] = useState("login");
    const [credentials, setCredentials] = useState({ login: "", password: "" });
    const [errors, setErrors] = useState(NO_ERRORS);
    const [submitting, setSubmitting] = useState(false);
    // Новый объект на каждую ошибку отправки: эффект ниже переводит фокус после перерисовки, когда кнопка снова доступна.
    const [focusRequest, setFocusRequest] = useState(null);
    const formRef = useRef(null);
    const noticeRef = useRef(null);
    // Флаг в ref закрывает окно между двумя событиями до перерисовки: state обновится только после неё.
    const inFlight = useRef(false);
    const tabRefs = useRef({});
    const idPrefix = useId();
    const current = MODES[mode];
    const tabId = (id) => `${idPrefix}-tab-${id}`;
    const panelId = `${idPrefix}-panel`;

    // Отключённая на время запроса кнопка роняет фокус на body; ошибка возвращает его на место (всегда, а не только при потере: так предсказуемее).
    useEffect(() => {
        if (!focusRequest) return;
        const form = formRef.current;
        const target = focusRequest.target === "submit" ? form.querySelector('[type="submit"]') : form.elements[focusRequest.target];
        target?.focus();
    }, [focusRequest]);

    // Экран входа появляется целиком, поэтому role="status" не озвучивается; фокус на сообщении (после размонтирования меню он на body) его зачитывает.
    useEffect(() => {
        if (sessionClosed) noticeRef.current?.focus();
    }, [sessionClosed]);

    // Пока запрос идёт, режим не меняется: ответ всегда относится к видимому режиму.
    const handleModeChange = (nextMode) => {
        if (inFlight.current) return;
        setMode(nextMode);
        setErrors(NO_ERRORS);
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
        // Ошибка поля относится к отправленному значению: правка поля её снимает.
        setErrors((prev) => {
            if (!(name in prev.fields)) return prev;
            const { [name]: _removed, ...fields } = prev.fields;
            return { ...prev, fields };
        });
    };

    const showError = (model) => {
        const described = describeFormError(model);
        setErrors(described);
        setFocusRequest({ target: focusTargetFor(described) });
    };

    // Одна отправка за раз. При успехе store переходит в authenticated и App показывает мессенджер вместо этого экрана.
    const handleSubmit = async (event) => {
        event.preventDefault();
        if (inFlight.current) return;
        const invalid = validateCredentials(mode, credentials);
        if (invalid) {
            showError(invalid);
            return;
        }
        inFlight.current = true;
        setSubmitting(true);
        setErrors(NO_ERRORS);
        try {
            await dispatch(current.action(credentials)).unwrap();
        } catch (model) {
            showError(model);
        } finally {
            inFlight.current = false;
            setSubmitting(false);
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
                            disabled={submitting}
                            onClick={() => handleModeChange(id)}
                            onKeyDown={handleTabKeyDown}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
                {sessionClosed && <p className="login__notice" role="status" tabIndex={-1} ref={noticeRef}>Сессия завершена. Войдите снова.</p>}
                {errors.message && <p className="login__error" role="alert">{errors.message}</p>}
                <form
                    className="login__form"
                    role="tabpanel"
                    id={panelId}
                    ref={formRef}
                    aria-labelledby={tabId(mode)}
                    onSubmit={handleSubmit}
                >
                    <Input
                        label="Логин"
                        name="login"
                        autoComplete="username"
                        value={credentials.login}
                        error={errors.fields.login}
                        onChange={handleChange}
                    />
                    <Input
                        label="Пароль"
                        name="password"
                        type="password"
                        autoComplete={current.passwordAutoComplete}
                        value={credentials.password}
                        error={errors.fields.password}
                        onChange={handleChange}
                    />
                    <Button type="submit" className="login__submit" loading={submitting}>{current.submit}</Button>
                </form>
            </div>
        </div>
    );
}
