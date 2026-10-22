import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import GroupManage from "./GroupManage";
import { rootReducer } from "../../../../store";
import { checkSession } from "../../../../reducers/auth";
import { chatReceived, selectChatById } from "../../../../reducers/chats";
import { chatSelected } from "../../../../reducers/activeChatId";
import { usersReceived } from "../../../../reducers/users";
import { ApiError } from "../../../../services/apiClient";
import * as chatsApi from "../../../../services/chatsApi";

jest.mock("../../../../services/chatsApi");

const me = { id: "u1", login: "ann", firstName: "Ann", lastName: "", name: "Ann", avatarUrl: "" };
const group = (members, extra = {}) => ({ id: "g1", type: "group", title: "Team", lastSeq: 0, lastMessage: null, unreadCount: 0, members, ...extra });
const asOwner = group([{ userId: "u1", role: "owner" }, { userId: "u2", role: "member" }]);
const asMember = group([{ userId: "u2", role: "owner" }, { userId: "u1", role: "member" }]);

const renderManage = (chat = asOwner) => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(me, "req"));
    store.dispatch(usersReceived([me, { id: "u2", name: "Боб Собеседник", avatarUrl: "" }]));
    if (chat) store.dispatch(chatReceived(chat));
    store.dispatch(chatSelected("g1"));
    const { unmount } = render(
        <Provider store={store}>
            <GroupManage chatId="g1" />
        </Provider>
    );
    return { store, unmount };
};

const open = () => userEvent.click(screen.getByRole("button", { name: "Управление группой" }));
const modal = () => screen.getByRole("dialog", { name: "Управление группой" });

afterEach(() => {
    jest.resetAllMocks();
});

describe("GroupManage: кнопка", () => {
    test("участнику группы (owner и не owner) показывается кнопка «Управление группой»", () => {
        renderManage();
        expect(screen.getByRole("button", { name: "Управление группой" })).toBeInTheDocument();
    });

    test("direct, неизвестный состав или чат — кнопки нет", () => {
        const cases = [group([{ userId: "u1", role: "member" }], { type: "direct" }), group(undefined), null];
        cases.forEach((chat) => {
            const { unmount } = renderManage(chat);
            expect(screen.queryByRole("button", { name: "Управление группой" })).not.toBeInTheDocument();
            unmount();
        });
    });

    test("кнопка открывает окно, Esc закрывает и возвращает фокус на кнопку", async () => {
        renderManage();
        const button = screen.getByRole("button", { name: "Управление группой" });

        await userEvent.click(button);
        expect(modal()).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(button).toHaveFocus();
    });
});

describe("GroupManage: owner", () => {
    test("видит поле названия с текущим названием и список участников; «Убрать» только у чужих, «Выйти» нет", async () => {
        renderManage();
        await open();

        expect(within(modal()).getByLabelText("Название группы")).toHaveValue("Team");
        expect(within(modal()).getByRole("button", { name: "Убрать Боб Собеседник" })).toBeInTheDocument();
        expect(within(modal()).getByText("Ann")).toBeInTheDocument();
        expect(within(modal()).getAllByRole("button", { name: /^Убрать/ })).toHaveLength(1);
        expect(within(modal()).queryByRole("button", { name: "Выйти из группы" })).not.toBeInTheDocument();
    });

    test("«Сохранить» шлёт PATCH с названием после trim и обновляет название в сторе", async () => {
        chatsApi.patchChat.mockResolvedValue({ id: "g1", type: "group", title: "Новое", lastSeq: 0, members: [] });
        const { store } = renderManage();
        await open();
        const field = within(modal()).getByLabelText("Название группы");

        await userEvent.clear(field);
        await userEvent.type(field, "  Новое  ");
        await userEvent.click(within(modal()).getByRole("button", { name: "Сохранить" }));

        await waitFor(() => expect(selectChatById(store.getState(), "g1").title).toBe("Новое"));
        expect(chatsApi.patchChat).toHaveBeenCalledWith("g1", "Новое", expect.anything());
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test("пустое название и длиннее 100 символов не отправляются, показывается текст у поля", async () => {
        renderManage();
        await open();
        const field = within(modal()).getByLabelText("Название группы");

        await userEvent.clear(field);
        await userEvent.click(within(modal()).getByRole("button", { name: "Сохранить" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Введите название группы");

        await userEvent.paste(field, "а".repeat(101));
        await userEvent.click(within(modal()).getByRole("button", { name: "Сохранить" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Название не длиннее 100 символов");
        expect(chatsApi.patchChat).not.toHaveBeenCalled();
    });

    test.each([
        [400, "Название не подходит. Измените его и повторите."],
        [403, "Переименовать может только владелец группы."],
        [404, "Группа не найдена."],
        [500, "Не удалось сохранить название."],
    ])("переименование: ошибка %s показывает понятный текст, название в сторе прежнее", async (status, text) => {
        chatsApi.patchChat.mockRejectedValue(new ApiError(status, { error: { code: "x" } }));
        const { store } = renderManage();
        await open();

        await userEvent.click(within(modal()).getByRole("button", { name: "Сохранить" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(text);
        expect(selectChatById(store.getState(), "g1").title).toBe("Team");
    });

    test("«Убрать <имя>» шлёт DELETE и убирает участника из списка", async () => {
        chatsApi.deleteChatMember.mockResolvedValue(undefined);
        const { store } = renderManage();
        await open();

        await userEvent.click(within(modal()).getByRole("button", { name: "Убрать Боб Собеседник" }));

        await waitFor(() => expect(within(modal()).queryByText("Боб Собеседник")).not.toBeInTheDocument());
        expect(chatsApi.deleteChatMember).toHaveBeenCalledWith("g1", "u2", expect.anything());
        expect(selectChatById(store.getState(), "g1").members).toEqual([{ userId: "u1", role: "owner" }]);
    });

    test("двойной клик по «Убрать» шлёт один запрос", async () => {
        let resolve;
        chatsApi.deleteChatMember.mockReturnValue(new Promise((res) => { resolve = res; }));
        renderManage();
        await open();

        await userEvent.dblClick(within(modal()).getByRole("button", { name: "Убрать Боб Собеседник" }));
        resolve();

        await waitFor(() => expect(within(modal()).queryByText("Боб Собеседник")).not.toBeInTheDocument());
        expect(chatsApi.deleteChatMember).toHaveBeenCalledTimes(1);
    });

    test.each([
        [403, "Убирать участников может только владелец группы."],
        [404, "Группа или участник не найдены."],
        [500, "Не удалось убрать участника."],
    ])("убрать: ошибка %s показывает понятный текст, участник остаётся", async (status, text) => {
        chatsApi.deleteChatMember.mockRejectedValue(new ApiError(status, { error: { code: "x" } }));
        renderManage();
        await open();

        await userEvent.click(within(modal()).getByRole("button", { name: "Убрать Боб Собеседник" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(text);
        expect(within(modal()).getByText("Боб Собеседник")).toBeInTheDocument();
        expect(within(modal()).getByRole("button", { name: "Убрать Боб Собеседник" })).toBeEnabled();
    });
});

describe("GroupManage: не owner", () => {
    test("видит «Выйти из группы» и состав, но не поле названия и не «Убрать»", async () => {
        renderManage(asMember);
        await open();

        expect(within(modal()).getByRole("button", { name: "Выйти из группы" })).toBeInTheDocument();
        expect(within(modal()).getByText("Боб Собеседник")).toBeInTheDocument();
        expect(within(modal()).queryByLabelText("Название группы")).not.toBeInTheDocument();
        expect(within(modal()).queryByRole("button", { name: /^Убрать/ })).not.toBeInTheDocument();
        expect(within(modal()).queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
    });

    test("«Выйти из группы» шлёт DELETE по своему id; чат убирается, активный чат сбрасывается, окно закрывается", async () => {
        chatsApi.deleteChatMember.mockResolvedValue(undefined);
        const { store } = renderManage(asMember);
        await open();

        await userEvent.click(within(modal()).getByRole("button", { name: "Выйти из группы" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(chatsApi.deleteChatMember).toHaveBeenCalledWith("g1", "u1", expect.anything());
        expect(selectChatById(store.getState(), "g1")).toBeUndefined();
        expect(store.getState().activeChatId).toBeNull();
    });

    test.each([
        [403, "Владелец не может выйти из группы."],
        [404, "Группа не найдена."],
        [500, "Не удалось выйти из группы."],
    ])("выход: ошибка %s показывает понятный текст, чат остаётся", async (status, text) => {
        chatsApi.deleteChatMember.mockRejectedValue(new ApiError(status, { error: { code: "x" } }));
        const { store } = renderManage(asMember);
        await open();

        await userEvent.click(within(modal()).getByRole("button", { name: "Выйти из группы" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(text);
        expect(selectChatById(store.getState(), "g1")).toBeDefined();
        expect(within(modal()).getByRole("button", { name: "Выйти из группы" })).toBeEnabled();
    });
});
