import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { Chat } from "./Chat";
import { rootReducer } from "../../../../store";
import { fetchChats } from "../../../../reducers/chats";
import { chatSelected } from "../../../../reducers/activeChatId";
import * as chatsApi from "../../../../services/chatsApi";

jest.mock("../../../../services/chatsApi");

const message = { chatId: "d1", seq: 12, senderId: "u2", clientId: "k1", body: "привет", createdAt: "2026-10-15T10:00:00.000Z" };
const direct = { id: "d1", type: "direct", title: null, lastSeq: 12, lastMessage: message, unreadCount: 3, peer: { id: "u2", name: "Bob Marley", avatarUrl: "" } };

const renderChat = async (onClick = jest.fn()) => {
    chatsApi.fetchChats.mockResolvedValue([direct]);
    const store = configureStore({ reducer: rootReducer });
    await act(() => store.dispatch(fetchChats()));
    const chat = store.getState().chats.entities.d1;
    render(
        <Provider store={store}>
            <Chat chat={chat} onClick={onClick} />
        </Provider>
    );
    return { store, onClick };
};

afterEach(() => {
    jest.resetAllMocks();
});

describe("Chat: карточка чата", () => {
    test("карточка — кнопка с именем, последним сообщением и числом непрочитанных", async () => {
        await renderChat();

        const card = screen.getByRole("button", { name: "Bob Marley привет 3 непрочитанных" });
        expect(card).toHaveTextContent("привет");
        expect(card).toHaveTextContent("3");
    });

    test("показывает аватар собеседника (инициалы)", async () => {
        await renderChat();

        const card = screen.getByRole("button", { name: /Bob Marley/ });
        expect(within(card).getByText("BM")).toBeInTheDocument();
    });

    test("блока «Members» нет", async () => {
        await renderChat();

        expect(screen.queryByText(/Members/)).not.toBeInTheDocument();
    });

    test("клик по карточке вызывает onClick", async () => {
        const { onClick } = await renderChat();

        fireEvent.click(screen.getByRole("button", { name: /Bob Marley/ }));

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    test("активный чат помечен классом _active и aria-current, неактивный — нет", async () => {
        const { store } = await renderChat();
        const card = screen.getByRole("button", { name: /Bob Marley/ });
        expect(card).not.toHaveClass("_active");
        expect(card).not.toHaveAttribute("aria-current");

        act(() => {
            store.dispatch(chatSelected("d1"));
        });

        expect(card).toHaveClass("_active");
        expect(card).toHaveAttribute("aria-current", "true");
    });
});
