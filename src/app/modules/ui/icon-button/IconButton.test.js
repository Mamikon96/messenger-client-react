import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
    test("доступное имя берётся из label, иконка скрыта от читалок", () => {
        render(<IconButton label="Закрыть"><svg data-testid="icon" /></IconButton>);
        const button = screen.getByRole("button", { name: "Закрыть" });
        expect(button).toHaveAttribute("type", "button");
        expect(button).toHaveClass("icon-button");
        expect(screen.getByTestId("icon").parentElement).toHaveAttribute("aria-hidden", "true");
    });

    test("клик и disabled", () => {
        const onClick = jest.fn();
        const { rerender } = render(<IconButton label="Назад" onClick={onClick}>←</IconButton>);
        userEvent.click(screen.getByRole("button", { name: "Назад" }));
        expect(onClick).toHaveBeenCalledTimes(1);
        rerender(<IconButton label="Назад" onClick={onClick} disabled>←</IconButton>);
        userEvent.click(screen.getByRole("button", { name: "Назад" }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
