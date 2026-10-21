import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "../button/Button";
import "./Dialog.css";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Модальное окно: role=dialog с именем из title, Esc и кнопка «Закрыть» вызывают onClose. Фокус уходит на первый
// фокусируемый элемент содержимого (иначе на «Закрыть»), Tab не выходит за окно, при закрытии фокус возвращается на прежний элемент.
export function Dialog({ title, onClose, children }) {
    const titleId = useId();
    const rootRef = useRef(null);
    const closeRef = useRef(onClose);
    const timerRef = useRef(null);

    useLayoutEffect(() => {
        closeRef.current = onClose;
    });

    useLayoutEffect(() => {
        const previous = document.activeElement;
        const root = rootRef.current;
        const focusables = () => [...root.querySelectorAll(FOCUSABLE)];
        focusables()[0]?.focus();

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeRef.current();
                return;
            }
            if (event.key !== "Tab") return;
            const items = focusables();
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (!root.contains(active)) {
                event.preventDefault();
                first.focus();
            } else if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            clearTimeout(timerRef.current);
            previous?.focus?.();
        };
    }, []);

    // Фокус потерян без нового адресата (сфокусированная кнопка стала disabled): остаётся в окне, а не уходит на body.
    // Уход из окна браузера activeElement не меняет, поэтому проверяется фактическое состояние после blur.
    const handleBlur = () => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            const root = rootRef.current;
            if (root?.isConnected && document.activeElement === document.body) root.focus();
        }, 0);
    };

    return createPortal(
        <div className="ui-dialog__overlay">
            <div className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={rootRef} tabIndex={-1} onBlur={handleBlur}>
                <h2 className="ui-dialog__title" id={titleId}>{title}</h2>
                <div className="ui-dialog__body">{children}</div>
                <div className="ui-dialog__footer">
                    <Button variant="ghost" onClick={() => closeRef.current()}>Закрыть</Button>
                </div>
            </div>
        </div>,
        document.body
    );
}
