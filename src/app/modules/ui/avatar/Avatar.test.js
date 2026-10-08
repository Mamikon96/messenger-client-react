import { fireEvent, render, screen } from "@testing-library/react";
import { Avatar, getInitials } from "./Avatar";

describe("getInitials", () => {
    test.each([
        ["Mock google user", "MG"],
        ["ann", "A"],
        ["  anna  maria  ", "AM"],
        ["", "?"],
        ["😀 Smile", "😀S"],
        [undefined, "?"],
    ])("%j → %s", (name, expected) => {
        expect(getInitials(name)).toBe(expected);
    });
});

describe("Avatar", () => {
    test("с src показывает картинку с alt из имени", () => {
        render(<Avatar src="http://a/b.png" name="Ann" />);
        expect(screen.getByRole("img", { name: "Ann" })).toHaveAttribute("src", "http://a/b.png");
    });

    test("без src показывает инициалы", () => {
        render(<Avatar name="Mock user" />);
        expect(screen.getByText("MU")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Mock user" })).toBeInTheDocument();
    });

    test("при ошибке загрузки картинки переключается на инициалы", () => {
        render(<Avatar src="http://bad/x.png" name="Ann Lee" />);
        fireEvent.error(screen.getByRole("img", { name: "Ann Lee" }));
        expect(screen.getByText("AL")).toBeInTheDocument();
    });

    test("смена src после ошибки снова пробует картинку", () => {
        const { rerender } = render(<Avatar src="http://bad/x.png" name="Ann" />);
        fireEvent.error(screen.getByRole("img", { name: "Ann" }));
        rerender(<Avatar src="http://good/y.png" name="Ann" />);
        expect(screen.getByRole("img", { name: "Ann" })).toHaveAttribute("src", "http://good/y.png");
    });

    test("цвет фона детерминирован по id и различается у разных id", () => {
        const color = (id) => {
            const { container, unmount } = render(<Avatar name="X" id={id} />);
            const value = container.firstChild.style.backgroundColor;
            unmount();
            return value;
        };
        expect(color("1")).toBe(color("1"));
        expect(color("1")).not.toBe(color("2"));
    });

    test("размер задаётся модификатором", () => {
        const { container } = render(<Avatar name="A" size="lg" />);
        expect(container.firstChild).toHaveClass("avatar", "_lg");
    });
});
