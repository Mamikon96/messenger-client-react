// Хранилище темы (FE-D08): режим light/dark/system, применённая тема, localStorage, <html data-theme>.
// Логика выбора темы дублируется в инлайн-скрипте public/index.html (применяет тему до первой отрисовки).
export const THEME_KEY = "theme";
export const MODES = ["light", "dark", "system"];

const QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set();

let mode = "system";
let systemDark = false;
let snapshot = { mode, theme: "light" };
let media = null;

function readStoredMode() {
    try {
        const stored = localStorage.getItem(THEME_KEY);
        return MODES.includes(stored) ? stored : "system";
    } catch {
        return "system";
    }
}

function storeMode(next) {
    try {
        localStorage.setItem(THEME_KEY, next);
    } catch {
        // хранилище недоступно (приватное окно, запрет сайта) — выбор живёт до перезагрузки
    }
}

function resolveTheme() {
    if (mode === "system") return systemDark ? "dark" : "light";
    return mode;
}

function update() {
    const theme = resolveTheme();
    document.documentElement.setAttribute("data-theme", theme);
    if (snapshot.mode === mode && snapshot.theme === theme) return;
    snapshot = { mode, theme };
    listeners.forEach((listener) => listener());
}

function handleSystemChange(event) {
    systemDark = event.matches;
    if (mode === "system") update();
}

// Читает сохранённый режим, подписывается на системную тему и применяет тему. Повторный вызов пересоздаёт состояние.
export function initTheme() {
    media?.removeEventListener?.("change", handleSystemChange);
    media = typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
    systemDark = Boolean(media?.matches);
    media?.addEventListener?.("change", handleSystemChange);
    mode = readStoredMode();
    update();
}

export function setMode(next) {
    if (!MODES.includes(next)) return;
    mode = next;
    storeMode(next);
    update();
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getSnapshot() {
    return snapshot;
}
