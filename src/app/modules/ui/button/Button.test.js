import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
    test("рендерит текст, type по умолчанию button, вариант primary", () => {
        render(<Button>Send</Button>);
        const button = screen.getByRole("button", { name: "Send" });
        expect(button).toHaveAttribute("type", "button");
        expect(button).toHaveClass("button", "_primary");
    });

    test.each(["secondary", "ghost"])("вариант %s", (variant) => {
        render(<Button variant={variant}>X</Button>);
        expect(screen.getByRole("button")).toHaveClass(`_${variant}`);
    });

    test("передаёт className, type и обработчик клика", () => {
        const onClick = jest.fn();
        render(<Button className="extra" type="submit" onClick={onClick}>Go</Button>);
        const button = screen.getByRole("button", { name: "Go" });
        expect(button).toHaveClass("extra");
        expect(button).toHaveAttribute("type", "submit");
        userEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    test("disabled не вызывает onClick", () => {
        const onClick = jest.fn();
        render(<Button disabled onClick={onClick}>Go</Button>);
        userEvent.click(screen.getByRole("button"));
        expect(onClick).not.toHaveBeenCalled();
    });

    test("loading: заблокирована, aria-busy, клик игнорируется, текст остаётся", () => {
        const onClick = jest.fn();
        render(<Button loading onClick={onClick}>Войти</Button>);
        const button = screen.getByRole("button", { name: /Войти/ });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("aria-busy", "true");
        expect(button).toHaveClass("_loading");
        userEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    test("без loading нет aria-busy", () => {
        render(<Button>Go</Button>);
        expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
    });

    describe("href: кнопка-ссылка", () => {
        test("рендерит ссылку с теми же классами", () => {
            render(<Button href="/go" variant="secondary" className="extra">Go</Button>);
            const link = screen.getByRole("link", { name: "Go" });
            expect(link).toHaveAttribute("href", "/go");
            expect(link).toHaveClass("button", "_secondary", "extra");
            expect(link).not.toHaveAttribute("type");
        });

        test("loading: aria-busy и aria-disabled, переход отменяется, onClick не вызывается", () => {
            const onClick = jest.fn();
            render(<Button href="/go" loading onClick={onClick}>Go</Button>);
            const link = screen.getByRole("link", { name: /Go/ });
            expect(link).toHaveAttribute("aria-busy", "true");
            expect(link).toHaveAttribute("aria-disabled", "true");
            const notPrevented = fireEvent.click(link);
            expect(notPrevented).toBe(false);
            expect(onClick).not.toHaveBeenCalled();
        });

        test("disabled ведёт себя как неактивная ссылка", () => {
            render(<Button href="/go" disabled>Go</Button>);
            const link = screen.getByRole("link", { name: "Go" });
            expect(link).toHaveAttribute("aria-disabled", "true");
            expect(fireEvent.click(link)).toBe(false);
        });

        test("активная ссылка не отменяет переход и вызывает onClick", () => {
            const onClick = jest.fn();
            render(<Button href="/go" onClick={onClick}>Go</Button>);
            const handler = (event) => event.preventDefault();
            document.addEventListener("click", handler);
            fireEvent.click(screen.getByRole("link", { name: "Go" }));
            document.removeEventListener("click", handler);
            expect(onClick).toHaveBeenCalledTimes(1);
        });
    });
});
