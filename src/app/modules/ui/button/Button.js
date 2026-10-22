import "./Button.css";

// variant: primary | secondary | ghost. loading блокирует действие (aria-disabled, фокус сохраняется) и показывает индикатор, текст остаётся.
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

    // В loading кнопка не disabled: иначе фокус уходит в body. Клик и submit отменяются вручную.
    const handleClick = (event) => {
        if (loading) {
            event.preventDefault();
            return;
        }
        onClick?.(event);
    };
    return (
        <button
            {...rest}
            type={type}
            className={classes}
            disabled={Boolean(disabled)}
            aria-busy={loading || undefined}
            aria-disabled={loading || undefined}
            onClick={handleClick}
        >
            {spinner}
            {children}
        </button>
    );
};
