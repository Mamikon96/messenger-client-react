import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import RealtimeBanner from "./RealtimeBanner";
import { rootReducer } from "../../../../store";
import { realtimeStatusChanged, startRealtime } from "../../../../reducers/realtime";
import { createWsService } from "../../../../services/wsService";

jest.mock("../../../../services/wsService", () => ({ createWsService: jest.fn() }));

let service;

const renderBanner = (status) => {
    createWsService.mockImplementation(() => {
        service = { connect: jest.fn(), close: jest.fn() };
        return service;
    });
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(startRealtime());
    store.dispatch(realtimeStatusChanged(status));
    render(
        <Provider store={store}>
            <RealtimeBanner />
        </Provider>
    );
    return { store };
};

test("при вытеснении лимитом вкладок показывает сообщение и кнопку «Подключиться»", () => {
    renderBanner("displaced");

    expect(screen.getByRole("status")).toHaveTextContent("Соединение занято в другой вкладке");
    expect(screen.getByRole("button", { name: "Подключиться" })).toBeInTheDocument();
});

test.each(["connecting", "open", "reconnecting", "closed"])("в статусе %s баннера нет", (status) => {
    renderBanner(status);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Подключиться" })).not.toBeInTheDocument();
});

test("«Подключиться» подключает сокет заново", () => {
    renderBanner("displaced");
    expect(service.connect).toHaveBeenCalledTimes(1);

    userEvent.click(screen.getByRole("button", { name: "Подключиться" }));

    expect(service.connect).toHaveBeenCalledTimes(2);
});
