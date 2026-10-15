import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Messenger from "./Messenger";
import { rootReducer } from "../../store";
import * as chatsApi from "../../services/chatsApi";

jest.mock("../../services/chatsApi");
jest.mock("./components/dialog/Dialog", () => () => <div>dialog</div>);

afterEach(() => {
    jest.resetAllMocks();
});

test("при показе мессенджера список чатов загружается с сервера", async () => {
    chatsApi.fetchChats.mockResolvedValue([{ id: "g1", type: "group", title: "Team", lastSeq: 0, lastMessage: null, unreadCount: 0 }]);
    const store = configureStore({ reducer: rootReducer });

    render(
        <Provider store={store}>
            <Messenger />
        </Provider>
    );

    expect(await screen.findByText("Team")).toBeInTheDocument();
    expect(chatsApi.fetchChats).toHaveBeenCalled();
});

const renderMessenger = () => {
    const store = configureStore({ reducer: rootReducer });
    const view = render(
        <Provider store={store}>
            <Messenger />
        </Provider>
    );
    return { store, ...view };
};

test("размонтирование отменяет незавершённую загрузку списка", () => {
    chatsApi.fetchChats.mockImplementation(() => new Promise(() => {}));
    const { unmount } = renderMessenger();
    const { signal } = chatsApi.fetchChats.mock.calls[0][0];
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
});

test("«Повторить» загружает список снова, а размонтирование отменяет этот запрос", async () => {
    chatsApi.fetchChats.mockRejectedValueOnce(new Error("network")).mockImplementationOnce(() => new Promise(() => {}));
    const { unmount } = renderMessenger();
    fireEvent.click(await screen.findByRole("button", { name: "Повторить" }));
    expect(chatsApi.fetchChats).toHaveBeenCalledTimes(2);
    const { signal } = chatsApi.fetchChats.mock.calls[1][0];
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
});
