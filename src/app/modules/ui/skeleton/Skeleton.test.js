import { render, screen } from "@testing-library/react";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
    test("скрыт от вспомогательных технологий", () => {
        render(<Skeleton />);
        const node = screen.getByTestId("skeleton");

        expect(node).toHaveAttribute("aria-hidden", "true");
        expect(node).toHaveClass("skeleton");
    });

    test("форма и размеры: круг, ширина, высота, дополнительный класс", () => {
        render(<Skeleton circle width="40px" height="40px" className="extra" />);
        const node = screen.getByTestId("skeleton");

        expect(node).toHaveClass("skeleton", "_circle", "extra");
        expect(node).toHaveStyle({ width: "40px", height: "40px" });
    });
});
