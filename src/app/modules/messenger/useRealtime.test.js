import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { useRealtime } from "./useRealtime";
import { nudgeRealtime, startRealtime } from "../../reducers/realtime";

jest.mock("../../reducers/realtime", () => ({ startRealtime: jest.fn(), nudgeRealtime: jest.fn() }));

const setVisibility = (state) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
};

beforeEach(() => {
    startRealtime.mockImplementation(() => () => () => {});
    nudgeRealtime.mockImplementation(() => () => {});
    setVisibility("visible");
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

test("после размонтирования слушатели сняты", () => {
    const { unmount } = renderRealtime();
    unmount();

    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(nudgeRealtime).not.toHaveBeenCalled();
});
