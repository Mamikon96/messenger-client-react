import fs from "fs";
import path from "path";

// Комментарии убираем до разбора, чтобы закомментированное объявление не считалось определённым.
const css = fs.readFileSync(path.join(__dirname, "tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const index = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

// Токены, которые меняются между темами: у каждой темы свой набор значений.
const THEMED = [
    "--color-bg", "--color-surface", "--color-surface-2",
    "--color-text", "--color-text-muted", "--color-border",
    "--color-accent", "--color-accent-contrast",
    "--color-danger", "--color-success", "--color-own-message",
    "--shadow-sm", "--shadow-md",
];
// Общие токены: одинаковы в обеих темах.
const SHARED = [
    "--font-family", "--font-size-sm", "--font-size-md", "--font-size-lg", "--line-height",
    "--space-1", "--space-2", "--space-3", "--space-4", "--space-6", "--space-8",
    "--radius-sm", "--radius-md", "--radius-lg", "--radius-full",
    "--duration-fast", "--duration-normal", "--easing",
];

// Тело первого блока с данным селектором.
function block(selector) {
    const start = css.indexOf(`${selector} {`);
    if (start === -1) return "";
    return css.slice(start, css.indexOf("}", start));
}

function declared(body, name) {
    return new RegExp(`${name}\\s*:\\s*[^;]+;`).test(body);
}

function value(body, name) {
    return body.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))[1].trim();
}

// Контраст WCAG 2.x между двумя цветами #rrggbb.
function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const COLOR_TOKENS = THEMED.filter((name) => name.startsWith("--color-"));
// Пары «текст на фоне», которые обязаны держать AA (4.5:1) в обеих темах.
const AA_PAIRS = [
    ["--color-text", "--color-bg"], ["--color-text", "--color-surface"],
    ["--color-text", "--color-surface-2"], ["--color-text", "--color-own-message"],
    ["--color-text-muted", "--color-bg"], ["--color-text-muted", "--color-surface"],
    ["--color-text-muted", "--color-surface-2"], ["--color-text-muted", "--color-own-message"],
    ["--color-accent-contrast", "--color-accent"],
    ["--color-accent", "--color-bg"], ["--color-accent", "--color-surface"],
    ["--color-danger", "--color-bg"], ["--color-danger", "--color-surface"],
    ["--color-success", "--color-bg"], ["--color-success", "--color-surface"],
];

describe("tokens.css", () => {
    const light = block(":root");
    const dark = block('[data-theme="dark"]');

    test.each([...THEMED, ...SHARED])("светлая тема (:root) определяет %s", (name) => {
        expect(declared(light, name)).toBe(true);
    });

    test.each(THEMED)("тёмная тема определяет %s", (name) => {
        expect(declared(dark, name)).toBe(true);
    });

    test.each(COLOR_TOKENS)("значение %s различается между темами", (name) => {
        expect(value(dark, name)).not.toBe(value(light, name));
    });

    test.each([["светлая", light], ["тёмная", dark]])("контраст AA (4.5:1) в теме: %s", (_, body) => {
        AA_PAIRS.forEach(([fg, bg]) => {
            expect({ fg, bg, ratio: contrast(value(body, fg), value(body, bg)) >= 4.5 }).toEqual({ fg, bg, ratio: true });
        });
    });

    test("prefers-reduced-motion обнуляет длительности анимаций", () => {
        const media = block("@media (prefers-reduced-motion: reduce)");
        expect(value(media, "--duration-fast")).toBe("0ms");
        expect(value(media, "--duration-normal")).toBe("0ms");
    });

    test("токены подключены в src/index.js до остальных стилей", () => {
        const tokens = index.indexOf("./styles/tokens.css");
        expect(tokens).toBeGreaterThan(-1);
        expect(tokens).toBeLessThan(index.indexOf("./index.css"));
    });
});
