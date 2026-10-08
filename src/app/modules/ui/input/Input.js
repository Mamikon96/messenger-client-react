import { forwardRef, useId } from "react";
import "./Input.css";

// Поле ввода (input или textarea при multiline). label и error необязательны: без них рендерится только само поле.
export const Input = forwardRef(function Input({ label, error, multiline = false, className = "", id, ...rest }, ref) {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const Control = multiline ? "textarea" : "input";
    const { "aria-describedby": describedBy, "aria-invalid": ariaInvalid, ...controlProps } = rest;
    const describedByIds = [describedBy, error && errorId].filter(Boolean).join(" ") || undefined;

    const control = (
        <Control
            {...controlProps}
            ref={ref}
            id={inputId}
            className={["input", error ? "_invalid" : "", className].filter(Boolean).join(" ")}
            aria-invalid={error ? "true" : ariaInvalid}
            aria-describedby={describedByIds}
        />
    );

    if (!label && !error) return control;

    return (
        <div className="input-field">
            {label && <label className="input-field__label" htmlFor={inputId}>{label}</label>}
            {control}
            {error && <p className="input-field__error" id={errorId} role="alert">{error}</p>}
        </div>
    );
});
