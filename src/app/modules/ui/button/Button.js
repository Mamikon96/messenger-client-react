import "./Button.css";

// variant: primary | secondary | ghost. loading блокирует кнопку и показывает индикатор, текст остаётся.
// С href рендерится ссылка с тем же видом; неактивная ссылка (disabled/loading) остаётся в порядке фокуса,
// получает aria-disabled, а переход по клику отменяется.
export const Button = ({ variant = "primary", loading = false, type = "button", className = "", disabled, href, onClick, children, ...rest }) => {
    const classes = ["button", `_${variant}`, loading ? "_loading" : "", className].filter(Boolean).join(" ");
    const inactive = Boolean(disabled) || loading;
    const spinner = loading && <span className="button__spinner" aria-hidden="true"></span>;

    if (href !== undefined) {
        const handleClick = (event) => {
            if (inactive) {
                event.preventDefault();
                return;
            }
            onClick?.(event);
        };
        return (
            <a
                {...rest}
                href={href}
                className={classes}
                aria-busy={loading || undefined}
                aria-disabled={inactive || undefined}
                onClick={handleClick}
            >
                {spinner}
                {children}
            </a>
        );
    }

    return (
        <button
            {...rest}
            type={type}
            className={classes}
            disabled={inactive}
            aria-busy={loading || undefined}
            onClick={onClick}
        >
            {spinner}
            {children}
        </button>
    );
};
