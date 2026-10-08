import fs from "fs";
import path from "path";

// Глобальные стили элементов button/input конфликтуют с примитивами (FE-24) и убраны из App.css.
const GLOBAL_ELEMENT = /(^|[\s,}>+~])(button|input|textarea|select)(\s*[,{:.>+~[]|\s*$)/m;
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("проверка ловит глобальные селекторы элементов", () => {
    ["button {}", "a, input {}", "button[type] {}", "x { } textarea:focus {}", "button > span {}"].forEach((css) => {
        expect(css).toMatch(GLOBAL_ELEMENT);
    });
    [".button {}", ".input:focus {}", ".join-form__footer .btn {}", ".x { color: red; }"].forEach((css) => {
        expect(css).not.toMatch(GLOBAL_ELEMENT);
    });
});

test("App.css и index.css не содержат глобальных селекторов button/input/textarea/select", () => {
    ["App.css", "index.css"].forEach((file) => {
        const css = strip(fs.readFileSync(path.join(__dirname, "..", "..", "..", file), "utf8"));
        expect(css).not.toMatch(GLOBAL_ELEMENT);
    });
});
