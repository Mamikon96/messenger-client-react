import { useEffect, useState } from "react";
import "./Login.css";
import { Button } from "../ui/button/Button";
import { ProviderIcon } from "./ProviderIcon";
import { PROVIDERS } from "./providers";

// Клик, который не уводит текущую вкладку (новая вкладка/окно по модификатору или средней кнопке).
const isPlainClick = (event) =>
    !event.defaultPrevented && event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);

// Ссылки, а не fetch: вход начинается полной навигацией браузера на BFF. error — готовый текст ошибки OAuth (FE-D11).
export default function Login({ error }) {
    const [pendingId, setPendingId] = useState(null);

    // Возврат кнопкой «назад» из bfcache показывает страницу с прежним состоянием — сбрасываем «Переход…».
    useEffect(() => {
        const handlePageShow = (event) => {
            if (event.persisted) setPendingId(null);
        };
        window.addEventListener("pageshow", handlePageShow);
        return () => window.removeEventListener("pageshow", handlePageShow);
    }, []);

    return (
        <div className="login">
            <div className="login__card">
                <h1 className="login__title">Messenger</h1>
                <p className="login__subtitle">Войдите, чтобы продолжить</p>
                {error && !pendingId && <p className="login__error" role="alert">{error}</p>}
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
