import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import CreateGroup from "./CreateGroup";
import { rootReducer } from "../../../../store";
import { checkSession } from "../../../../reducers/auth";
import { ApiError } from "../../../../services/apiClient";
import * as chatsApi from "../../../../services/chatsApi";

jest.mock("../../../../services/chatsApi");

const me = { id: "u1", login: "ann", firstName: "Ann", lastName: "", name: "Ann", avatarUrl: "" };
const dto = { id: "g1", type: "group", title: "Team", lastSeq: 0, members: [{ userId: "u1", name: "Ann", avatarUrl: "", role: "owner" }] };

const renderForm = () => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(me, "req"));
    render(
        <Provider store={store}>
            <CreateGroup />
        </Provider>
    );
    return { store };
};

const open = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Новая группа" }));
    return screen.getByLabelText("Название");
};

afterEach(() => {
    jest.resetAllMocks();
});

describe("CreateGroup", () => {
    test("форма скрыта, пока не нажата «Новая группа»; «Отмена» закрывает её", async () => {
        renderForm();
        expect(screen.queryByLabelText("Название")).not.toBeInTheDocument();

        await open();
        await userEvent.click(screen.getByRole("button", { name: "Отмена" }));

        expect(screen.queryByLabelText("Название")).not.toBeInTheDocument();
    });

    test("пустое название (после trim) — ошибка в форме, запрос не отправляется", async () => {
        renderForm();
        const field = await open();

        await userEvent.type(field, "   ");
        await userEvent.click(screen.getByRole("button", { name: "Создать" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Введите название группы");
        expect(chatsApi.postGroupChat).not.toHaveBeenCalled();
    });

    test("название длиннее 100 единиц UTF-16 — ошибка, запрос не отправляется", async () => {
        renderForm();
        const field = await open();

        await userEvent.paste(field, "я".repeat(101));
        await userEvent.click(screen.getByRole("button", { name: "Создать" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Название не длиннее 100 символов");
        expect(chatsApi.postGroupChat).not.toHaveBeenCalled();
    });

    test("успех: название уходит после trim, чат открывается, форма очищается и закрывается", async () => {
        chatsApi.postGroupChat.mockResolvedValue(dto);
        const { store } = renderForm();
        const field = await open();

        await userEvent.type(field, "  Team  ");
        await userEvent.click(screen.getByRole("button", { name: "Создать" }));

        await waitFor(() => expect(screen.queryByLabelText("Название")).not.toBeInTheDocument());
        expect(chatsApi.postGroupChat).toHaveBeenCalledWith("Team", expect.anything());
        expect(store.getState().activeChatId).toBe("g1");
        await userEvent.click(screen.getByRole("button", { name: "Новая группа" }));
        expect(screen.getByLabelText("Название")).toHaveValue("");
    });

    test("двойной клик создаёт одну группу", async () => {
        chatsApi.postGroupChat.mockImplementation(() => new Promise(() => {}));
        renderForm();
        const field = await open();

        await userEvent.type(field, "Team");
        const submit = screen.getByRole("button", { name: "Создать" });
        await userEvent.dblClick(submit);

        expect(chatsApi.postGroupChat).toHaveBeenCalledTimes(1);
        expect(submit).toBeDisabled();
    });

    test("400 — ошибка в форме, название остаётся, форма открыта", async () => {
        chatsApi.postGroupChat.mockRejectedValue(new ApiError(400, { error: { code: "validation_failed" } }));
        renderForm();
        const field = await open();

        await userEvent.type(field, "Team");
        await userEvent.click(screen.getByRole("button", { name: "Создать" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Название не подходит");
        expect(screen.getByLabelText("Название")).toHaveValue("Team");
    });

    test("прочая ошибка — «Не удалось создать группу.», можно повторить", async () => {
        chatsApi.postGroupChat.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(dto);
        renderForm();
        const field = await open();

        await userEvent.type(field, "Team");
        await userEvent.click(screen.getByRole("button", { name: "Создать" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось создать группу.");

        await userEvent.click(screen.getByRole("button", { name: "Создать" }));
        await waitFor(() => expect(screen.queryByLabelText("Название")).not.toBeInTheDocument());
    });

    test("суррогатные пары считаются в единицах UTF-16: 51 эмодзи — ошибка длины", async () => {
        renderForm();
        const field = await open();

        await userEvent.paste(field, "😀".repeat(51));
        await userEvent.click(screen.getByRole("button", { name: "Создать" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Название не длиннее 100 символов");
        expect(chatsApi.postGroupChat).not.toHaveBeenCalled();
    });

    test("100 символов с пробелами по краям — запрос уходит после trim", async () => {
        chatsApi.postGroupChat.mockResolvedValue(dto);
        renderForm();
        const field = await open();

        await userEvent.paste(field, ` ${"a".repeat(100)} `);
        await userEvent.click(screen.getByRole("button", { name: "Создать" }));

        await waitFor(() => expect(chatsApi.postGroupChat).toHaveBeenCalledWith("a".repeat(100), expect.anything()));
    });

    test("сбой не помечает поле невалидным, но показывает alert", async () => {
        chatsApi.postGroupChat.mockRejectedValue(new Error("network"));
        renderForm();
        const field = await open();

        await userEvent.type(field, "Team");
        await userEvent.click(screen.getByRole("button", { name: "Создать" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось создать группу.");
        expect(field).not.toHaveAttribute("aria-invalid", "true");
    });

    test("фокус возвращается на «Новая группа» после «Отмена»", async () => {
        renderForm();
        await open();

        await userEvent.click(screen.getByRole("button", { name: "Отмена" }));

        await waitFor(() => expect(screen.getByRole("button", { name: "Новая группа" })).toHaveFocus());
    });

    test("фокус возвращается на «Новая группа» после успеха", async () => {
        chatsApi.postGroupChat.mockResolvedValue(dto);
        renderForm();
        const field = await open();

        await userEvent.type(field, "Team");
        await userEvent.click(screen.getByRole("button", { name: "Создать" }));

        await waitFor(() => expect(screen.getByRole("button", { name: "Новая группа" })).toHaveFocus());
    });
});
