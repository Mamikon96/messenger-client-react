import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Chats from "./Chats";
import { rootReducer } from "../../../../store";
import { fetchChats } from "../../../../reducers/chats";
import * as chatsApi from "../../../../services/chatsApi";

jest.mock("../../../../services/chatsApi");

const message = { chatId: "d1", seq: 12, senderId: "u2", clientId: "k1", body: "привет, как дела", createdAt: "2026-10-15T10:00:00.000Z" };
const direct = { id: "d1", type: "direct", title: null, lastSeq: 12, lastMessage: message, unreadCount: 3, peer: { id: "u2", name: "Bob", avatarUrl: "" } };
const group = { id: "g1", type: "group", title: "Team", lastSeq: 0, lastMessage: null, unreadCount: 0 };

// dispatch вне обработчика React — в act, чтобы обновления компонента не давали предупреждений
const load = (store) => act(() => store.dispatch(fetchChats()));

const renderChats = async (response, props = {}) => {
    chatsApi.fetchChats.mockImplementation(() => response);
    const store = configureStore({ reducer: rootReducer });
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

        expect(await screen.findByRole("status")).toHaveTextContent("Загрузка чатов…");
        expect(screen.queryByText("Чатов пока нет")).not.toBeInTheDocument();
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
});
