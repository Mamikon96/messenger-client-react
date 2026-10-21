import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PeopleSearch from "./PeopleSearch";

const bob = { id: "u2", name: "Bob Tester", avatarUrl: "" };
const carol = { id: "u3", name: "Carol", avatarUrl: "" };

const renderSearch = (props = {}) => {
    const onQueryChange = jest.fn();
    const onWrite = jest.fn();
    const getAction = jest.fn((user) => ({
        label: `Написать ${user.name}`,
        icon: <span>+</span>,
        disabled: false,
        onClick: () => onWrite(user.id),
    }));
    render(<PeopleSearch query="" onQueryChange={onQueryChange} status="idle" results={[]} getAction={getAction} {...props} />);
    return { onQueryChange, onWrite, getAction };
};

test("поле поиска имеет подпись и сообщает о вводе", () => {
    const { onQueryChange } = renderSearch();

    userEvent.type(screen.getByLabelText("Поиск людей"), "B");

    expect(onQueryChange).toHaveBeenCalledWith("B");
});

test("поле показывает переданный query", () => {
    renderSearch({ query: "Bo" });

    expect(screen.getByLabelText("Поиск людей")).toHaveValue("Bo");
});

test("пока запроса нет (idle) — блока «Люди» нет", () => {
    renderSearch();

    expect(screen.queryByRole("heading", { name: "Люди" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

test("role=status смонтирован всегда: из idle в loading тот же элемент, текст обновляется", () => {
    const noop = () => ({});
    const { rerender } = render(<PeopleSearch query="" onQueryChange={() => {}} status="idle" results={[]} getAction={noop} />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    rerender(<PeopleSearch query="Bo" onQueryChange={() => {}} status="loading" results={[]} getAction={noop} />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Поиск…");

    rerender(<PeopleSearch query="Bo" onQueryChange={() => {}} status="succeeded" results={[bob, carol]} getAction={(user) => ({ label: `Написать ${user.name}`, icon: null, onClick: () => {} })} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Найдено: 2");

    rerender(<PeopleSearch query="Zz" onQueryChange={() => {}} status="succeeded" results={[]} getAction={noop} />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Никого не найдено");

    rerender(<PeopleSearch query="Zz" onQueryChange={() => {}} status="failed" results={[]} getAction={noop} />);
    expect(region).toBeEmptyDOMElement();
});

test("loading — «Поиск…» в aria-live, списка нет", () => {
    renderSearch({ query: "Bo", status: "loading" });

    expect(screen.getByRole("heading", { name: "Люди" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Поиск…");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

test("пустая выдача — «Никого не найдено»", () => {
    renderSearch({ query: "Zz", status: "succeeded", results: [] });

    expect(screen.getByRole("status")).toHaveTextContent("Никого не найдено");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

test("ошибка поиска — сообщение в role=alert", () => {
    renderSearch({ query: "Bo", status: "failed" });

    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось выполнить поиск.");
});

test("результаты — список строк с именем, аватаром и кнопкой «Написать <имя>»", () => {
    renderSearch({ query: "Bo", status: "succeeded", results: [bob, carol] });

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Bob Tester")).toBeInTheDocument();
    expect(within(items[0]).getByRole("img", { name: "Bob Tester" })).toBeInTheDocument();
    expect(within(items[0]).getByRole("button", { name: "Написать Bob Tester" })).toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: "Написать Carol" })).toBeInTheDocument();
    expect(screen.queryByText("Никого не найдено")).not.toBeInTheDocument();
});

test("клик по действию строки вызывает onClick именно этой строки", () => {
    const { onWrite } = renderSearch({ query: "Bo", status: "succeeded", results: [bob, carol] });

    userEvent.click(screen.getByRole("button", { name: "Написать Carol" }));

    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(onWrite).toHaveBeenCalledWith("u3");
});

test("строка с busy из getAction: aria-busy и aria-disabled, кнопка остаётся доступной для фокуса, клик не вызывает onClick", () => {
    const onClick = jest.fn();
    const getAction = (user) => ({ label: `Написать ${user.name}`, icon: null, disabled: false, busy: user.id === "u2", onClick });
    renderSearch({ query: "Bo", status: "succeeded", results: [bob, carol], getAction });

    const busy = screen.getByRole("button", { name: "Написать Bob Tester" });
    userEvent.click(busy);

    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).toBeEnabled();
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Написать Carol" })).not.toHaveAttribute("aria-busy");
});

test("disabled из getAction блокирует кнопку строки", () => {
    const getAction = (user) => ({ label: `Написать ${user.name}`, icon: null, disabled: user.id === "u2", onClick: () => {} });
    renderSearch({ query: "Bo", status: "succeeded", results: [bob, carol], getAction });

    expect(screen.getByRole("button", { name: "Написать Bob Tester" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Написать Carol" })).toBeEnabled();
});

test("error (ошибка действия) показывается в role=alert", () => {
    renderSearch({ query: "Bo", status: "succeeded", results: [bob], error: "Не удалось открыть чат." });

    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось открыть чат.");
});
