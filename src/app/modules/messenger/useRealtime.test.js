import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { useRealtime } from "./useRealtime";
import { nudgeRealtime, reconcileRealtime, startRealtime } from "../../reducers/realtime";

jest.mock("../../reducers/realtime", () => ({ startRealtime: jest.fn(), nudgeRealtime: jest.fn(), reconcileRealtime: jest.fn() }));

const setVisibility = (state) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
};

beforeEach(() => {
    startRealtime.mockImplementation(() => () => () => {});
    nudgeRealtime.mockImplementation(() => () => {});
    reconcileRealtime.mockImplementation(() => () => {});
    setVisibility("visible");
});

afterEach(() => {
    jest.restoreAllMocks();
});

const renderRealtime = () => {
    const store = configureStore({ reducer: (state = {}) => state });
    return renderHook(() => useRealtime(), { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> });
};

test("событие online просит повторить подключение сразу", () => {
    renderRealtime();

    window.dispatchEvent(new Event("online"));

    expect(nudgeRealtime).toHaveBeenCalledTimes(1);
});

test("вкладка стала видимой — повтор; скрытой — нет", () => {
    renderRealtime();

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(nudgeRealtime).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(nudgeRealtime).toHaveBeenCalledTimes(1);
});

test("вкладка стала видимой — сверка списка чатов; скрытая вкладка — нет", () => {
    renderRealtime();

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reconcileRealtime).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reconcileRealtime).toHaveBeenCalledTimes(1);

});

test("фокус окна без visibilitychange — сверка списка чатов", () => {
    renderRealtime();

    window.dispatchEvent(new Event("focus"));

    expect(reconcileRealtime).toHaveBeenCalledTimes(1);
    expect(nudgeRealtime).not.toHaveBeenCalled();
});

test("visibilitychange и focus подряд при возврате на вкладку — одна сверка; событие позже окна — ещё одна", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    renderRealtime();

    document.dispatchEvent(new Event("visibilitychange"));
    now.mockReturnValue(1_000_000 + 100);
    window.dispatchEvent(new Event("focus"));
    expect(reconcileRealtime).toHaveBeenCalledTimes(1);
    expect(nudgeRealtime).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 5000);
    window.dispatchEvent(new Event("focus"));
    expect(reconcileRealtime).toHaveBeenCalledTimes(2);
});

test("после размонтирования слушатели сняты", () => {
    const { unmount } = renderRealtime();
    unmount();

    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(nudgeRealtime).not.toHaveBeenCalled();
    expect(reconcileRealtime).not.toHaveBeenCalled();
});
