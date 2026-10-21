import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";

function Host({ onClose = () => {} }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button onClick={() => setOpen(true)}>Открыть</button>
            {open && (
                <Dialog title="Заголовок" onClose={() => { onClose(); setOpen(false); }}>
                    <input aria-label="Поле" />
                    <button>Действие</button>
                </Dialog>
            )}
        </>
    );
}

describe("Dialog", () => {
    test("role=dialog, aria-modal и имя из заголовка", async () => {
        render(<Host />);
        await userEvent.click(screen.getByRole("button", { name: "Открыть" }));

        const dialog = screen.getByRole("dialog", { name: "Заголовок" });
        expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    test("фокус уходит внутрь окна при открытии", async () => {
        render(<Host />);
        await userEvent.click(screen.getByRole("button", { name: "Открыть" }));

        expect(within(screen.getByRole("dialog")).getByRole("textbox", { name: "Поле" })).toHaveFocus();
    });

    test("Esc закрывает окно и возвращает фокус на кнопку-источник", async () => {
        const onClose = jest.fn();
        render(<Host onClose={onClose} />);
        const source = screen.getByRole("button", { name: "Открыть" });
        await userEvent.click(source);

        await userEvent.keyboard("{Escape}");

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(source).toHaveFocus();
    });

    test("кнопка «Закрыть» закрывает окно", async () => {
        const onClose = jest.fn();
        render(<Host onClose={onClose} />);
        await userEvent.click(screen.getByRole("button", { name: "Открыть" }));

        await userEvent.click(screen.getByRole("button", { name: "Закрыть" }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("Tab не выводит фокус за пределы окна", async () => {
        render(<Host />);
        await userEvent.click(screen.getByRole("button", { name: "Открыть" }));
        const dialog = screen.getByRole("dialog");

        for (let i = 0; i < 6; i += 1) {
            await userEvent.tab();
            expect(within(dialog).getAllByRole("button").concat(within(dialog).getByRole("textbox")).some((el) => el.matches(":focus"))).toBe(true);
        }
        for (let i = 0; i < 6; i += 1) {
            await userEvent.tab({ shift: true });
            expect(within(dialog).getAllByRole("button").concat(within(dialog).getByRole("textbox")).some((el) => el.matches(":focus"))).toBe(true);
        }
    });

    test("фокус не уходит на body, когда сфокусированный элемент потерял фокус без адресата", async () => {
        render(<Host />);
        await userEvent.click(screen.getByRole("button", { name: "Открыть" }));
        const field = screen.getByRole("textbox", { name: "Поле" });

        act(() => field.blur());
        expect(document.body).toHaveFocus();

        await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    });

    test("уход из окна браузера (blur без смены activeElement) не уводит фокус из поля", () => {
        jest.useFakeTimers();
        try {
            render(<Host />);
            fireEvent.click(screen.getByRole("button", { name: "Открыть" }));
            const input = screen.getByRole("textbox", { name: "Поле" });
            expect(input).toHaveFocus();

            fireEvent.focusOut(input, { relatedTarget: null });
            act(() => { jest.runAllTimers(); });

            expect(input).toHaveFocus();
        } finally {
            jest.useRealTimers();
        }
    });

    test("перевод фокуса на другой элемент окна не перехватывается", async () => {
        render(<Host />);
        await userEvent.click(screen.getByRole("button", { name: "Открыть" }));
        const dialog = screen.getByRole("dialog");
        const action = within(dialog).getByRole("button", { name: "Действие" });

        await userEvent.click(action);

        expect(action).toHaveFocus();
    });
});
