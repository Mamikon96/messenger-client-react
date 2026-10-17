import "./MessageStatus.css";

const svgProps = { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

// Статус своего сообщения в серверном чате: часы (sending), галочка (sent), красный треугольник с «!» — кнопка повтора (failed).
function MessageStatus({ status, onRetry }) {
    if (status === "failed") {
        return (
            <button type="button" className="message-status message-status__retry" aria-label="Не отправлено. Повторить" onClick={onRetry}>
                <svg {...svgProps} aria-hidden="true" focusable="false">
                    <path d="M8 2 L14.5 13.5 H1.5 Z" fill="currentColor" stroke="currentColor" />
                    <path className="message-status__glyph" d="M8 6.5 V9.5 M8 11.6 V11.7" />
                </svg>
            </button>
        );
    }
    if (status === "sent") {
        return (
            <span className="message-status message-status__sent" role="img" aria-label="Отправлено">
                <svg {...svgProps} aria-hidden="true" focusable="false"><path d="M3 8.5 L6.5 12 L13 4.5" /></svg>
            </span>
        );
    }
    return (
        <span className="message-status message-status__sending" role="img" aria-label="Отправляется">
            <svg {...svgProps} aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6" /><path d="M8 4.5 V8 L10.5 9.5" /></svg>
        </span>
    );
}

export default MessageStatus;
