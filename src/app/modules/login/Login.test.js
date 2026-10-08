import { act, fireEvent, render, screen } from "@testing-library/react";
import Login from "./Login";

// jsdom не умеет навигацию: гасим переход, но запоминаем, был ли клик уже отменён обработчиком Login.
let seen;
const onDocumentClick = (event) => {
    seen.push(event.defaultPrevented);
    event.preventDefault();
};

beforeEach(() => {
    seen = [];
    document.addEventListener("click", onDocumentClick);
});
afterEach(() => document.removeEventListener("click", onDocumentClick));

describe("Login", () => {
    test("показывает провайдеров ссылками на /api/auth/{id}/start", () => {
        render(<Login />);
        expect(screen.getByRole("link", { name: "Войти через Google" })).toHaveAttribute("href", "/api/auth/google/start");
        expect(screen.getByRole("link", { name: "Войти через GitHub" })).toHaveAttribute("href", "/api/auth/github/start");
    });

    test("иконки провайдеров скрыты от скринридеров", () => {
        const { container } = render(<Login />);
        const icons = container.querySelectorAll("svg");
        expect(icons).toHaveLength(2);
        icons.forEach((icon) => expect(icon).toHaveAttribute("aria-hidden", "true"));
    });

    test("без ошибки нет блока alert", () => {
        render(<Login />);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test("ошибка показывается в role=alert", () => {
        render(<Login error="Вход отменён" />);
        expect(screen.getByRole("alert")).toHaveTextContent("Вход отменён");
    });

    test("клик по провайдеру: «Переход…», aria-busy, переход не отменяется", () => {
        render(<Login />);
        fireEvent.click(screen.getByRole("link", { name: "Войти через Google" }));
        const google = screen.getByRole("link", { name: /Переход…/ });
        expect(google).toHaveAttribute("aria-busy", "true");
        expect(google).toHaveAttribute("href", "/api/auth/google/start");
        expect(seen).toEqual([false]);
    });

    test("после клика другой провайдер неактивен: aria-disabled и клик отменяется", () => {
        render(<Login />);
        fireEvent.click(screen.getByRole("link", { name: "Войти через Google" }));
        const github = screen.getByRole("link", { name: "Войти через GitHub" });
        expect(github).toHaveAttribute("aria-disabled", "true");
        fireEvent.click(github);
        expect(seen).toEqual([false, true]);
        expect(screen.getByRole("link", { name: /Переход…/ })).toBeInTheDocument();
    });

    test("ошибка скрывается, когда пользователь начал новый вход", () => {
        render(<Login error="Вход отменён" />);
        fireEvent.click(screen.getByRole("link", { name: "Войти через GitHub" }));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test.each([
        ["Ctrl", { ctrlKey: true }],
        ["Cmd", { metaKey: true }],
        ["Shift", { shiftKey: true }],
        ["Alt", { altKey: true }],
        ["средняя кнопка", { button: 1 }],
    ])("клик с модификатором (%s) открывает ссылку отдельно и не включает «Переход…»", (_, init) => {
        render(<Login />);
        fireEvent.click(screen.getByRole("link", { name: "Войти через Google" }), init);
        expect(screen.getByRole("link", { name: "Войти через Google" })).not.toHaveAttribute("aria-busy");
        expect(screen.getByRole("link", { name: "Войти через GitHub" })).not.toHaveAttribute("aria-disabled");
    });

    test("в состоянии «Переход…» доступное имя сохраняет провайдера", () => {
        render(<Login />);
        fireEvent.click(screen.getByRole("link", { name: "Войти через Google" }));
        expect(screen.getByRole("link", { name: "Переход… (Google)" })).toBeInTheDocument();
    });

    test("pageshow без persisted состояние не сбрасывает", () => {
        render(<Login />);
        fireEvent.click(screen.getByRole("link", { name: "Войти через Google" }));
        act(() => {
            window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
        });
        expect(screen.getByRole("link", { name: /Переход…/ })).toHaveAttribute("aria-busy", "true");
    });

    test("возврат из bfcache (pageshow persisted) сбрасывает «Переход…»", () => {
        render(<Login />);
        fireEvent.click(screen.getByRole("link", { name: "Войти через Google" }));
        act(() => {
            window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
        });
        expect(screen.getByRole("link", { name: "Войти через Google" })).not.toHaveAttribute("aria-busy");
        expect(screen.getByRole("link", { name: "Войти через GitHub" })).not.toHaveAttribute("aria-disabled");
    });
});
