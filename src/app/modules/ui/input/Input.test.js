import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input";

describe("Input", () => {
    test("label связан с полем", () => {
        render(<Input label="Название" name="title" />);
        const input = screen.getByLabelText("Название");
        expect(input.tagName).toBe("INPUT");
        expect(input).toHaveAttribute("name", "title");
    });

    test("без label работает с aria-label", () => {
        render(<Input aria-label="Поиск" />);
        expect(screen.getByLabelText("Поиск")).toBeInTheDocument();
    });

    test("ввод вызывает onChange, value контролируется снаружи", () => {
        const onChange = jest.fn();
        render(<Input label="Имя" value="" onChange={onChange} />);
        userEvent.type(screen.getByLabelText("Имя"), "a");
        expect(onChange).toHaveBeenCalled();
    });

    test("error: aria-invalid, сообщение связано через aria-describedby", () => {
        render(<Input label="Имя" error="Обязательное поле" />);
        const input = screen.getByLabelText("Имя");
        expect(input).toHaveAttribute("aria-invalid", "true");
        const message = screen.getByText("Обязательное поле");
        expect(input.getAttribute("aria-describedby")).toBe(message.id);
        expect(message).toHaveAttribute("role", "alert");
    });

    test("без error нет aria-invalid и aria-describedby", () => {
        render(<Input label="Имя" />);
        const input = screen.getByLabelText("Имя");
        expect(input).not.toHaveAttribute("aria-invalid");
        expect(input).not.toHaveAttribute("aria-describedby");
    });

    test("пользовательский aria-describedby сохраняется и дополняется id ошибки", () => {
        const { rerender } = render(<Input label="Имя" aria-describedby="hint" />);
        expect(screen.getByLabelText("Имя")).toHaveAttribute("aria-describedby", "hint");
        rerender(<Input label="Имя" aria-describedby="hint" error="Ошибка" />);
        const input = screen.getByLabelText("Имя");
        expect(input.getAttribute("aria-describedby").split(" ")).toEqual(["hint", screen.getByText("Ошибка").id]);
    });

    test("пользовательский aria-invalid без error сохраняется", () => {
        render(<Input label="Имя" aria-invalid="true" />);
        expect(screen.getByLabelText("Имя")).toHaveAttribute("aria-invalid", "true");
    });

    test("multiline рендерит textarea", () => {
        render(<Input multiline aria-label="Сообщение" />);
        expect(screen.getByLabelText("Сообщение").tagName).toBe("TEXTAREA");
    });

    test("ref указывает на поле, className и disabled передаются", () => {
        const ref = createRef();
        render(<Input ref={ref} className="extra" disabled aria-label="X" />);
        expect(ref.current).toBe(screen.getByLabelText("X"));
        expect(ref.current).toHaveClass("extra");
        expect(ref.current).toBeDisabled();
    });

    test("уникальные id у нескольких полей", () => {
        render(<><Input label="A" /><Input label="B" /></>);
        expect(screen.getByLabelText("A").id).not.toBe(screen.getByLabelText("B").id);
    });
});
