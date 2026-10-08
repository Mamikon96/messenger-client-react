import "./Button.css";

// variant: primary | secondary | ghost. loading блокирует кнопку и показывает индикатор, текст остаётся.
export const Button = ({ variant = "primary", loading = false, type = "button", className = "", disabled, children, ...rest }) => {
    const classes = ["button", `_${variant}`, loading ? "_loading" : "", className].filter(Boolean).join(" ");
    return (
        <button
            {...rest}
            type={type}
            className={classes}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
        >
            {loading && <span className="button__spinner" aria-hidden="true"></span>}
            {children}
        </button>
    );
};
