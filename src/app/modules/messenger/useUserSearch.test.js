import { act, renderHook } from "@testing-library/react";
import { useUserSearch } from "./useUserSearch";
import { searchUsers } from "../../services/usersApi";

jest.mock("../../services/usersApi");

const bob = { id: "u2", name: "Bob", avatarUrl: "" };

// Отложенный ответ: тест сам решает, когда запрос завершится.
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const type = (result, value) => act(() => result.current.setQuery(value));
const advance = (ms) => act(() => jest.advanceTimersByTime(ms));
const flush = () => act(() => Promise.resolve());

beforeEach(() => {
    jest.useFakeTimers();
    searchUsers.mockResolvedValue([bob]);
});

afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
});

test("начальное состояние: пустой запрос, статус idle, результатов нет", () => {
    const { result } = renderHook(() => useUserSearch());

    expect(result.current).toMatchObject({ query: "", results: [], status: "idle" });
});

test("запрос короче 2 символов после trim не уходит на сервер", () => {
    const { result } = renderHook(() => useUserSearch());

    type(result, "B");
    type(result, "  B  ");
    advance(5000);

    expect(searchUsers).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
});

test("2 символа: запрос уходит не сразу, а после паузы ввода, с q после trim", async () => {
    const { result } = renderHook(() => useUserSearch());

    type(result, "  Bo ");
    expect(result.current.status).toBe("loading");
    expect(searchUsers).not.toHaveBeenCalled();

    advance(1000);
    expect(searchUsers).toHaveBeenCalledTimes(1);
    expect(searchUsers).toHaveBeenCalledWith("Bo", expect.objectContaining({ signal: expect.any(AbortSignal) }));

    await flush();
    expect(result.current).toMatchObject({ status: "succeeded", results: [bob] });
});

test("частый ввод даёт один запрос: debounce сбрасывается каждым символом", async () => {
    const { result } = renderHook(() => useUserSearch());

    type(result, "Bo");
    advance(100);
    type(result, "Bob");
    advance(100);
    type(result, "Bobb");
    advance(1000);
    await flush();

    expect(searchUsers).toHaveBeenCalledTimes(1);
    expect(searchUsers.mock.calls[0][0]).toBe("Bobb");
});

test("новый запрос отменяет прежний (AbortController), ответ устаревшего не попадает в результаты", async () => {
    const first = deferred();
    const second = deferred();
    searchUsers.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useUserSearch());

    type(result, "Bo");
    advance(1000);
    const firstSignal = searchUsers.mock.calls[0][1].signal;
    type(result, "Bob");
    advance(1000);

    expect(firstSignal.aborted).toBe(true);
    expect(searchUsers.mock.calls[1][1].signal.aborted).toBe(false);

    first.resolve([{ id: "u9", name: "Старый", avatarUrl: "" }]);
    await flush();
    expect(result.current.status).toBe("loading");
    expect(result.current.results).toEqual([]);

    second.resolve([bob]);
    await flush();
    expect(result.current).toMatchObject({ status: "succeeded", results: [bob] });
});

test("пока идёт загрузка — loading без прошлых результатов", async () => {
    const pending = deferred();
    searchUsers.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useUserSearch());

    type(result, "Bo");
    advance(1000);

    expect(result.current).toMatchObject({ status: "loading", results: [] });
    pending.resolve([bob]);
    await flush();
});

test("пустая выдача — succeeded с пустым списком", async () => {
    searchUsers.mockResolvedValue([]);
    const { result } = renderHook(() => useUserSearch());

    type(result, "Zz");
    advance(1000);
    await flush();

    expect(result.current).toMatchObject({ status: "succeeded", results: [] });
});

test("ошибка запроса — failed", async () => {
    searchUsers.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useUserSearch());

    type(result, "Bo");
    advance(1000);
    await flush();

    expect(result.current).toMatchObject({ status: "failed", results: [] });
});

test("стирание запроса до < 2 символов отменяет запрос и возвращает idle", async () => {
    const pending = deferred();
    searchUsers.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useUserSearch());

    type(result, "Bo");
    advance(1000);
    const { signal } = searchUsers.mock.calls[0][1];
    type(result, "B");

    expect(signal.aborted).toBe(true);
    expect(result.current).toMatchObject({ query: "B", status: "idle", results: [] });
    pending.resolve([bob]);
    await flush();
    expect(result.current.status).toBe("idle");
});

test("размонтирование отменяет таймер и запрос", () => {
    const { result, unmount } = renderHook(() => useUserSearch());

    type(result, "Bo");
    unmount();
    advance(1000);

    expect(searchUsers).not.toHaveBeenCalled();
});

test("размонтирование во время запроса отменяет его", () => {
    searchUsers.mockReturnValue(new Promise(() => {}));
    const { result, unmount } = renderHook(() => useUserSearch());

    type(result, "Bo");
    advance(1000);
    const { signal } = searchUsers.mock.calls[0][1];
    unmount();

    expect(signal.aborted).toBe(true);
});
