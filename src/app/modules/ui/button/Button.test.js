import { render, screen } from "@testing-library/react";
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
});
