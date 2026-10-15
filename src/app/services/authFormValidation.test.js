import { validateCredentials } from "./authFormValidation";

const fields = (fieldCodes) => ({ kind: "fields", fields: fieldCodes });

describe("validateCredentials: вход проверяет только непустые поля", () => {
    test("оба поля заполнены: ошибок нет", () => {
        expect(validateCredentials("login", { login: "a", password: "x" })).toBeNull();
    });

    test("пустые поля → required", () => {
        expect(validateCredentials("login", { login: "", password: "" })).toEqual(
            fields({ login: "required", password: "required" })
        );
    });

    test("логин из пробелов пуст (сервер делает trim), пароль из пробелов не пуст (без trim)", () => {
        expect(validateCredentials("login", { login: "   ", password: "   " })).toEqual(fields({ login: "required" }));
    });

    test("формат логина и длина пароля при входе не проверяются", () => {
        expect(validateCredentials("login", { login: "A b!", password: "1" })).toBeNull();
    });
});

describe("validateCredentials: регистрация", () => {
    const valid = { login: "new-user", password: "correct-horse-1" };

    test("верные поля: ошибок нет", () => {
        expect(validateCredentials("register", valid)).toBeNull();
    });

    test.each([
        ["", "required"],
        ["   ", "required"],
        ["ab", "invalid_format"],
        ["a b", "invalid_format"],
        ["логин", "invalid_format"],
        ["user!", "invalid_format"],
        ["a".repeat(33), "too_long"],
        ["я".repeat(33), "too_long"],
        ["😀".repeat(17), "too_long"],
    ])("логин %j → %s", (login, code) => {
        expect(validateCredentials("register", { ...valid, login })).toEqual(fields({ login: code }));
    });

    test.each([["abc"], ["a".repeat(32)], ["  Alice  "], ["A.b_c-1"]])("логин %j допустим после trim и нижнего регистра", (login) => {
        expect(validateCredentials("register", { ...valid, login })).toBeNull();
    });

    test("приоритет логина: required > too_long > invalid_format", () => {
        expect(validateCredentials("register", { ...valid, login: "A".repeat(40) })).toEqual(fields({ login: "too_long" }));
    });

    test("пароль: пустой → required, 11 байт → too_short, 12 байт → верно", () => {
        expect(validateCredentials("register", { ...valid, password: "" })).toEqual(fields({ password: "required" }));
        expect(validateCredentials("register", { ...valid, password: "a".repeat(11) })).toEqual(fields({ password: "too_short" }));
        expect(validateCredentials("register", { ...valid, password: "a".repeat(12) })).toBeNull();
    });

    test("пароль считается в байтах UTF-8, а не в символах", () => {
        // 6 кириллических букв = 12 байт, хотя символов меньше 12
        expect(validateCredentials("register", { ...valid, password: "пароль" })).toBeNull();
        expect(validateCredentials("register", { ...valid, password: "парол" })).toEqual(fields({ password: "too_short" }));
        // 128 букв = 256 байт — граница, 129 = 258 байт
        expect(validateCredentials("register", { ...valid, password: "я".repeat(128) })).toBeNull();
        expect(validateCredentials("register", { ...valid, password: "я".repeat(129) })).toEqual(fields({ password: "too_long" }));
    });

    test("пароль 256 байт верен, 257 — too_long", () => {
        expect(validateCredentials("register", { ...valid, password: "a".repeat(256) })).toBeNull();
        expect(validateCredentials("register", { ...valid, password: "a".repeat(257) })).toEqual(fields({ password: "too_long" }));
    });

    test("пароль не обрезается: пробелы по краям считаются", () => {
        expect(validateCredentials("register", { ...valid, password: "           a" })).toBeNull();
        expect(validateCredentials("register", { ...valid, password: " ".repeat(12) })).toBeNull();
    });

    test("ошибки логина и пароля возвращаются вместе", () => {
        expect(validateCredentials("register", { login: "ab", password: "short" })).toEqual(
            fields({ login: "invalid_format", password: "too_short" })
        );
    });
});
