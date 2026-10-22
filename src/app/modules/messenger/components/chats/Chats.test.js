import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Chats from "./Chats";
import { rootReducer } from "../../../../store";
import { fetchChats } from "../../../../reducers/chats";
import { checkSession, logout } from "../../../../reducers/auth";
import { ApiError } from "../../../../services/apiClient";
import { searchUsers } from "../../../../services/usersApi";
import * as chatsApi from "../../../../services/chatsApi";

jest.mock("../../../../services/chatsApi");
jest.mock("../../../../services/usersApi");

const message = { chatId: "d1", seq: 12, senderId: "u2", clientId: "k1", body: "привет, как дела", createdAt: "2026-10-15T10:00:00.000Z" };
const direct = { id: "d1", type: "direct", title: null, lastSeq: 12, lastMessage: message, unreadCount: 3, peer: { id: "u2", name: "Bob", avatarUrl: "" } };
const group = { id: "g1", type: "group", title: "Team", lastSeq: 0, lastMessage: null, unreadCount: 0 };

const me = { id: "u1", login: "ann", firstName: "Ann", lastName: "", name: "Ann", avatarUrl: "" };

// dispatch вне обработчика React — в act, чтобы обновления компонента не давали предупреждений
const load = (store) => act(() => store.dispatch(fetchChats()));

const renderChats = async (response, props = {}) => {
    chatsApi.fetchChats.mockImplementation(() => response);
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(me, "req"));
    render(
        <Provider store={store}>
            <Chats {...props} />
        </Provider>
    );
    return { store };
};

afterEach(() => {
    jest.resetAllMocks();
});

describe("Chats: загрузка и список", () => {
    test("пока загрузка идёт — «Загрузка чатов…» (status), чатов нет", async () => {
        const { store } = await renderChats(new Promise(() => {}));
        act(() => {
            store.dispatch(fetchChats());
        });

        expect(await screen.findByText("Загрузка чатов…")).toHaveAttribute("role", "status");
        expect(screen.queryByText("Чатов пока нет")).not.toBeInTheDocument();
    });

    test("скелетоны (aria-hidden) есть, пока промис не разрешён, и пропадают после (UC-CHAT-03)", async () => {
        let release;
        const { store } = await renderChats(new Promise((resolve) => { release = () => resolve([direct]); }));
        act(() => {
            store.dispatch(fetchChats());
        });

        await screen.findByText("Загрузка чатов…");
        screen.getAllByTestId("skeleton").forEach((node) => expect(node).toHaveAttribute("aria-hidden", "true"));
        await act(async () => {
            release();
        });

        expect(await screen.findByText("Bob")).toBeInTheDocument();
        expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
    });

    test("пустой список — «Чатов пока нет»", async () => {
        const { store } = await renderChats(Promise.resolve([]));
        await load(store);

        expect(await screen.findByText("Чатов пока нет")).toBeInTheDocument();
        expect(screen.queryByText("Загрузка чатов…")).not.toBeInTheDocument();
    });

    test("ошибка — alert «Не удалось загрузить чаты.» и «Повторить», который вызывает onRetry", async () => {
        const onRetry = jest.fn();
        const { store } = await renderChats(Promise.reject(new Error("network")), { onRetry });
        await load(store);

        expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить чаты.");
        fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test("чаты показываются в порядке сервера: имя, последнее сообщение, число непрочитанных только при > 0", async () => {
        const { store } = await renderChats(Promise.resolve([group, direct]));
        await load(store);

        const items = await screen.findAllByText(/Team|Bob/);
        expect(items.map((item) => item.textContent)).toEqual(["Team", "Bob"]);
        expect(screen.getByText("привет, как дела")).toBeInTheDocument();
        expect(screen.getByText("3")).toBeInTheDocument();
        expect(screen.getAllByTestId("chat-unread")).toHaveLength(1);
    });

    test("каждый чат — кнопка с аватаром; блока «Members» нет", async () => {
        const { store } = await renderChats(Promise.resolve([group, direct]));
        await load(store);

        // две кнопки чатов и «Новая группа»
        expect(await screen.findAllByRole("button")).toHaveLength(3);
        expect(within(screen.getByRole("button", { name: "Bob привет, как дела 3 непрочитанных" })).getByText("B")).toBeInTheDocument();
        expect(within(screen.getByRole("button", { name: "Team" })).getByText("T")).toBeInTheDocument();
        expect(screen.queryByText(/Members/)).not.toBeInTheDocument();
    });

    test("клик по карточке делает чат активным", async () => {
        const { store } = await renderChats(Promise.resolve([group, direct]));
        await load(store);

        fireEvent.click(await screen.findByRole("button", { name: /Team/ }));

        expect(screen.getByRole("button", { name: /Team/ })).toHaveClass("_active");
        expect(screen.getByRole("button", { name: /Bob/ })).not.toHaveClass("_active");
    });
});

describe("Chats: поиск людей", () => {
    const bob = { id: "u2", name: "Bob", avatarUrl: "" };
    const bobDto = {
        id: "d9", type: "direct", title: null, lastSeq: 0,
        members: [
            { userId: "u1", name: "Ann", avatarUrl: "", role: "member" },
            { userId: "u2", name: "Bob", avatarUrl: "", role: "member" },
        ],
    };

    const search = async (text = "Bo") => {
        const store = (await renderChats(Promise.resolve([group]))).store;
        await load(store);
        userEvent.type(screen.getByLabelText("Поиск людей"), text);
        return store;
    };

    beforeEach(() => {
        searchUsers.mockResolvedValue([bob]);
    });

    test("поле поиска стоит над списком чатов; блока «Люди» нет, пока запрос короче 2 символов", async () => {
        await search("B");

        expect(screen.queryByRole("heading", { name: "Люди" })).not.toBeInTheDocument();
        expect(searchUsers).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Team" })).toBeInTheDocument();
    });

    test("ввод 2 символов показывает блок «Люди» с найденными и кнопкой «Написать <имя>»", async () => {
        await search();

        expect(await screen.findByRole("button", { name: "Написать Bob" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Люди" })).toBeInTheDocument();
        expect(searchUsers).toHaveBeenCalledWith("Bo", expect.any(Object));
    });

    test("«Написать» создаёт direct-чат: он появляется в списке и становится активным", async () => {
        chatsApi.postDirectChat.mockResolvedValue(bobDto);
        const store = await search();

        userEvent.click(await screen.findByRole("button", { name: "Написать Bob" }));

        expect(chatsApi.postDirectChat).toHaveBeenCalledWith("u2", expect.any(Object));
        await waitFor(() => expect(store.getState().activeChatId).toBe("d9"));
        expect(screen.getByRole("button", { name: /^Bob/, current: true })).toBeInTheDocument();
    });

    test("пока идёт создание, строка человека помечена занятой (aria-busy) без потери фокуса, повторный клик игнорируется", async () => {
        chatsApi.postDirectChat.mockReturnValue(new Promise(() => {}));
        await search();
        const button = await screen.findByRole("button", { name: "Написать Bob" });
        button.focus();

        userEvent.click(button);

        await waitFor(() => expect(screen.getByRole("button", { name: "Написать Bob" })).toHaveAttribute("aria-busy", "true"));
        expect(button).toHaveAttribute("aria-disabled", "true");
        expect(button).toBeEnabled();
        expect(button).toHaveFocus();
        userEvent.click(button);
        expect(chatsApi.postDirectChat).toHaveBeenCalledTimes(1);
    });

    test("пока идёт создание, кнопки других людей заблокированы", async () => {
        const carol = { id: "u3", name: "Carol", avatarUrl: "" };
        searchUsers.mockResolvedValue([bob, carol]);
        chatsApi.postDirectChat.mockReturnValue(new Promise(() => {}));
        await search();

        userEvent.click(await screen.findByRole("button", { name: "Написать Bob" }));

        await waitFor(() => expect(screen.getByRole("button", { name: "Написать Carol" })).toBeDisabled());
    });

    test("ошибка открытия чата исчезает при изменении запроса", async () => {
        chatsApi.postDirectChat.mockRejectedValue(new Error("network"));
        await search();
        userEvent.click(await screen.findByRole("button", { name: "Написать Bob" }));
        expect(await screen.findByText("Не удалось открыть чат.")).toBeInTheDocument();

        userEvent.type(screen.getByLabelText("Поиск людей"), "b");

        expect(screen.queryByText("Не удалось открыть чат.")).not.toBeInTheDocument();
    });

    test("ответ устаревшего открытия (store сброшен выходом) не показывает ошибку", async () => {
        let rejectRequest;
        chatsApi.postDirectChat.mockImplementation(() => new Promise((_, reject) => { rejectRequest = reject; }));
        const store = await search();
        userEvent.click(await screen.findByRole("button", { name: "Написать Bob" }));

        act(() => {
            store.dispatch(logout.fulfilled(undefined, "req"));
        });
        await act(async () => {
            rejectRequest(new Error("network"));
        });

        expect(screen.queryByText("Не удалось открыть чат.")).not.toBeInTheDocument();
    });

    test("404 — «Пользователь недоступен» в alert, кнопка снова доступна", async () => {
        chatsApi.postDirectChat.mockRejectedValue(new ApiError(404, { error: { code: "not_found" } }));
        await search();

        userEvent.click(await screen.findByRole("button", { name: "Написать Bob" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Пользователь недоступен");
        expect(screen.getByRole("button", { name: "Написать Bob" })).toBeEnabled();
    });

    test("прочий сбой — «Не удалось открыть чат.» в alert", async () => {
        chatsApi.postDirectChat.mockRejectedValue(new Error("network"));
        await search();

        userEvent.click(await screen.findByRole("button", { name: "Написать Bob" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось открыть чат.");
    });
});
