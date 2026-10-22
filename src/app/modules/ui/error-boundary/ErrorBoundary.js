import { Component } from "react";
import { Button } from "../button/Button";
import "./ErrorBoundary.css";

// Граница ошибок рендера (FE-D58): вместо упавшего поддерева показывает сообщение и кнопку. Ловит только ошибки рендера
// и методов жизненного цикла: обработчики событий и асинхронный код обрабатываются на месте (thunk, сервис).
// По умолчанию кнопка «Повторить» сбрасывает границу; onAction заменяет сброс (корень: перезагрузка страницы).
// fullscreen — запасной экран на всю высоту окна (корень приложения).
class ErrorBoundary extends Component {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error, info) {
        console.error("ErrorBoundary", error, info.componentStack);
    }

    reset = () => {
        this.setState({ failed: false });
    };

    render() {
        const { actionLabel = "Повторить", onAction, fullscreen = false, children } = this.props;
        if (!this.state.failed) return children;

        return (
            <div className={`error-boundary${fullscreen ? " _fullscreen" : ""}`} role="alert">
                <p className="error-boundary__message">Что-то пошло не так</p>
                <Button onClick={onAction ?? this.reset}>{actionLabel}</Button>
            </div>
        );
    }
}

export default ErrorBoundary;
