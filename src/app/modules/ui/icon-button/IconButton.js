import "./IconButton.css";

// Кнопка-иконка: доступное имя обязательно (label), сама иконка скрыта от скринридеров.
export const IconButton = ({ label, type = "button", className = "", children, ...rest }) => (
    <button {...rest} type={type} className={`icon-button ${className}`.trim()} aria-label={label}>
        <span className="icon-button__icon" aria-hidden="true">{children}</span>
    </button>
);
