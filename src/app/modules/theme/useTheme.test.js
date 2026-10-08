import { act, renderHook } from "@testing-library/react";
import useTheme from "./useTheme";
import { getSnapshot, initTheme, setMode } from "./theme";

// Управляемая подмена matchMedia('(prefers-color-scheme: dark)').
let media;
const originalMatchMedia = window.matchMedia;
function mockMatchMedia(matches) {
    const listeners = new Set();
    media = {
        listeners,
        matches,
        addEventListener: (_, fn) => listeners.add(fn),
        removeEventListener: (_, fn) => listeners.delete(fn),
        change(next) {
            media.matches = next;
            listeners.forEach((fn) => fn({ matches: next }));
        },
    };
    window.matchMedia = jest.fn(() => media);
}

const html = () => document.documentElement.getAttribute("data-theme");

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    mockMatchMedia(false);
});

afterEach(() => {
    jest.restoreAllMocks();
    // jsdom не реализует matchMedia: возвращаем исходное состояние (в т.ч. «свойства нет»)
    if (originalMatchMedia === undefined) delete window.matchMedia;
    else window.matchMedia = originalMatchMedia;
});

describe("useTheme", () => {
    test("без сохранённого выбора режим system, тема следует системе", () => {
        mockMatchMedia(true);
        initTheme();
        const { result } = renderHook(() => useTheme());
        expect(result.current.mode).toBe("system");
        expect(result.current.theme).toBe("dark");
        expect(html()).toBe("dark");
    });

    test("сохранённый режим читается из localStorage и применяется", () => {
        localStorage.setItem("theme", "dark");
        initTheme();
        const { result } = renderHook(() => useTheme());
        expect(result.current.mode).toBe("dark");
        expect(html()).toBe("dark");
    });

    test("неизвестное сохранённое значение игнорируется", () => {
        localStorage.setItem("theme", "purple");
        initTheme();
        const { result } = renderHook(() => useTheme());
        expect(result.current.mode).toBe("system");
        expect(html()).toBe("light");
    });

    test("setMode применяет тему и сохраняет выбор", () => {
        initTheme();
        const { result } = renderHook(() => useTheme());
        act(() => result.current.setMode("dark"));
        expect(result.current).toMatchObject({ mode: "dark", theme: "dark" });
        expect(html()).toBe("dark");
        expect(localStorage.getItem("theme")).toBe("dark");
        act(() => result.current.setMode("light"));
        expect(html()).toBe("light");
        expect(localStorage.getItem("theme")).toBe("light");
    });

    test("setMode с неизвестным режимом ничего не меняет", () => {
        initTheme();
        const { result } = renderHook(() => useTheme());
        act(() => result.current.setMode("purple"));
        expect(result.current.mode).toBe("system");
        expect(localStorage.getItem("theme")).toBeNull();
    });

    test("в режиме system смена системной темы переключает тему", () => {
        initTheme();
        const { result } = renderHook(() => useTheme());
        expect(html()).toBe("light");
        act(() => media.change(true));
        expect(result.current.theme).toBe("dark");
        expect(html()).toBe("dark");
    });

    test("при явном режиме смена системной темы игнорируется", () => {
        localStorage.setItem("theme", "light");
        initTheme();
        const { result } = renderHook(() => useTheme());
        act(() => media.change(true));
        expect(result.current.theme).toBe("light");
        expect(html()).toBe("light");
    });

    test("выбор system после явного режима снова следует системе", () => {
        mockMatchMedia(true);
        localStorage.setItem("theme", "light");
        initTheme();
        const { result } = renderHook(() => useTheme());
        act(() => result.current.setMode("system"));
        expect(result.current.theme).toBe("dark");
    });

    test("сбой localStorage не ломает чтение и запись", () => {
        jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
        jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
        initTheme();
        const { result } = renderHook(() => useTheme());
        expect(result.current.mode).toBe("system");
        expect(() => act(() => result.current.setMode("dark"))).not.toThrow();
        expect(result.current.mode).toBe("dark");
        expect(html()).toBe("dark");
    });

    test("без matchMedia тема system — светлая", () => {
        delete window.matchMedia;
        initTheme();
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe("light");
    });

    test("несколько потребителей видят одно состояние", () => {
        initTheme();
        const a = renderHook(() => useTheme());
        const b = renderHook(() => useTheme());
        act(() => a.result.current.setMode("dark"));
        expect(b.result.current.mode).toBe("dark");
    });

    test("после unmount потребитель не получает обновлений и слушатель снимается", () => {
        initTheme();
        const { result, unmount } = renderHook(() => useTheme());
        const before = result.current;
        unmount();
        act(() => setMode("dark"));
        expect(result.current).toBe(before);
    });

    test("setMode с тем же режимом не создаёт новое состояние", () => {
        initTheme();
        const { result } = renderHook(() => useTheme());
        act(() => result.current.setMode("dark"));
        const first = getSnapshot();
        act(() => result.current.setMode("dark"));
        expect(getSnapshot()).toBe(first);
    });

    test("повторный initTheme снимает слушатель с прежнего matchMedia", () => {
        initTheme();
        const old = media;
        expect(old.listeners.size).toBe(1);
        mockMatchMedia(false);
        initTheme();
        expect(old.listeners.size).toBe(0);
        expect(media.listeners.size).toBe(1);
    });
});
