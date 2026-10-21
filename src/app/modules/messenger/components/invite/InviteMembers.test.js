import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import InviteMembers from "./InviteMembers";
import { rootReducer } from "../../../../store";
import { checkSession } from "../../../../reducers/auth";
import { chatReceived } from "../../../../reducers/chats";
import { ApiError } from "../../../../services/apiClient";
import * as chatsApi from "../../../../services/chatsApi";
import * as usersApi from "../../../../services/usersApi";

jest.mock("../../../../services/chatsApi");
jest.mock("../../../../services/usersApi");

const me = { id: "u1", login: "ann", firstName: "Ann", lastName: "", name: "Ann", avatarUrl: "" };
const bob = { id: "u2", name: "Боб Собеседник", avatarUrl: "" };
const carol = { id: "u3", name: "Кэрол Коллега", avatarUrl: "" };
const group = (members) => ({ id: "g1", type: "group", title: "Team", lastSeq: 0, lastMessage: null, unreadCount: 0, members });
const owned = group([{ userId: "u1", role: "owner" }]);
const dtoWith = (...people) => ({
    id: "g1", type: "group", title: "Team", lastSeq: 0,
    members: [{ userId: "u1", name: "Ann", avatarUrl: "", role: "owner" }, ...people.map((p) => ({ userId: p.id, name: p.name, avatarUrl: "", role: "member" }))],
});

const IN_CHAT = "Пригласить Боб Собеседник: уже в чате";

const renderInvite = (chat = owned) => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(me, "req"));
    if (chat) store.dispatch(chatReceived(chat));
    render(
        <Provider store={store}>
            <InviteMembers chatId="g1" />
        </Provider>
    );
    return { store };
};

const openAndSearch = async (query = "Боб") => {
    await userEvent.click(screen.getByRole("button", { name: "Пригласить" }));
    await userEvent.type(screen.getByLabelText("Поиск людей"), query);
};

beforeEach(() => {
    usersApi.searchUsers.mockResolvedValue([bob, carol]);
});

afterEach(() => {
    jest.resetAllMocks();
});

describe("InviteMembers", () => {
    test("не owner (или состав неизвестен) кнопки не видит", () => {
        renderInvite(group([{ userId: "u1", role: "member" }, { userId: "u2", role: "owner" }]));
        expect(screen.queryByRole("button", { name: "Пригласить" })).not.toBeInTheDocument();
    });

    test("состав чата неизвестен — кнопки нет", () => {
        renderInvite({ id: "g1", type: "group", title: "Team", lastSeq: 0, lastMessage: null, unreadCount: 0 });
        expect(screen.queryByRole("button", { name: "Пригласить" })).not.toBeInTheDocument();
    });

    test("owner: кнопка открывает окно «Пригласить в группу», Esc закрывает и возвращает фокус на кнопку", async () => {
        renderInvite();
        const button = screen.getByRole("button", { name: "Пригласить" });

        await userEvent.click(button);
        expect(screen.getByRole("dialog", { name: "Пригласить в группу" })).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(button).toHaveFocus();
    });

    test("действие строки «Пригласить <имя>» шлёт POST members по chatId и обновляет состав; участник становится «уже в чате»", async () => {
        chatsApi.postChatMember.mockResolvedValue(undefined);
        chatsApi.fetchChat.mockResolvedValue(dtoWith(bob));
        renderInvite();
        await openAndSearch();

        await userEvent.click(await screen.findByRole("button", { name: "Пригласить Боб Собеседник" }));

        await waitFor(() => expect(screen.getByRole("button", { name: IN_CHAT })).toBeDisabled());
        expect(chatsApi.postChatMember).toHaveBeenCalledWith("g1", "u2", expect.anything());
        expect(screen.getByRole("button", { name: "Пригласить Кэрол Коллега" })).toBeEnabled();
    });

    test("участники чата сразу показываются как «уже в чате» и недоступны", async () => {
        renderInvite(group([{ userId: "u1", role: "owner" }, { userId: "u2", role: "member" }]));
        await openAndSearch();

        expect(await screen.findByRole("button", { name: IN_CHAT })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Пригласить Кэрол Коллега" })).toBeEnabled();
    });

    test("двойной клик отправляет один запрос", async () => {
        let resolve;
        chatsApi.postChatMember.mockReturnValue(new Promise((res) => { resolve = res; }));
        chatsApi.fetchChat.mockResolvedValue(dtoWith(bob));
        renderInvite();
        await openAndSearch();
        const action = await screen.findByRole("button", { name: "Пригласить Боб Собеседник" });

        await userEvent.dblClick(action);
        resolve();

        await waitFor(() => expect(screen.getByRole("button", { name: IN_CHAT })).toBeDisabled());
        expect(chatsApi.postChatMember).toHaveBeenCalledTimes(1);
    });

    test.each([
        [403, "Приглашать может только владелец группы."],
        [404, "Группа или человек не найдены."],
        [400, "В группе не больше 100 участников."],
        [500, "Не удалось пригласить."],
    ])("ошибка %s показывает понятный текст", async (status, text) => {
        chatsApi.postChatMember.mockRejectedValue(new ApiError(status, { error: { code: "x" } }));
        renderInvite();
        await openAndSearch();

        await userEvent.click(await screen.findByRole("button", { name: "Пригласить Боб Собеседник" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(text);
        expect(screen.getByRole("button", { name: "Пригласить Боб Собеседник" })).toBeEnabled();
    });

    test("409 already_member — успех без ошибки", async () => {
        chatsApi.postChatMember.mockRejectedValue(new ApiError(409, { error: { code: "already_member" } }));
        chatsApi.fetchChat.mockResolvedValue(dtoWith(bob));
        renderInvite();
        await openAndSearch();

        await userEvent.click(await screen.findByRole("button", { name: "Пригласить Боб Собеседник" }));

        await waitFor(() => expect(screen.getByRole("button", { name: IN_CHAT })).toBeDisabled());
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test("сбой перечитывания состава после успешного POST не показывает ошибку приглашения", async () => {
        chatsApi.postChatMember.mockResolvedValue(undefined);
        chatsApi.fetchChat.mockRejectedValue(new ApiError(500, { error: { code: "x" } }));
        renderInvite();
        await openAndSearch();

        await userEvent.click(await screen.findByRole("button", { name: "Пригласить Боб Собеседник" }));

        await waitFor(() => expect(chatsApi.fetchChat).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByRole("button", { name: "Пригласить Боб Собеседник" })).not.toHaveAttribute("aria-busy"));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});
