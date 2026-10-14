import { ApiError } from "./apiClient";
import { toFormError } from "./authFormError";

const apiError = (status, code, { details, retryAfter } = {}) =>
    new ApiError(status, { error: { code, message: "текст не используется", ...(details && { details }) } }, { retryAfter });

describe("toFormError: ошибка входа/регистрации → модель ошибки формы", () => {
    test("400 validation_failed: поля берутся из details по field и code", () => {
        const error = apiError(400, "validation_failed", {
            details: [
                { field: "login", code: "invalid_format" },
                { field: "password", code: "too_short" },
            ],
        });

        expect(toFormError(error)).toEqual({ kind: "fields", fields: { login: "invalid_format", password: "too_short" } });
    });

    test("400 validation_failed: по полю берётся первый код, неизвестные поля игнорируются", () => {
        const error = apiError(400, "validation_failed", {
            details: [
                { field: "password", code: "too_common" },
                { field: "password", code: "too_short" },
                { field: "firstName", code: "required" },
            ],
        });

        expect(toFormError(error)).toEqual({ kind: "fields", fields: { password: "too_common" } });
    });

    test("400 validation_failed без details, с неизвестным полем или кодом → unexpected", () => {
        expect(toFormError(apiError(400, "validation_failed"))).toEqual({ kind: "unexpected" });
        expect(toFormError(apiError(400, "validation_failed", { details: [{ field: "firstName", code: "required" }] }))).toEqual({
            kind: "unexpected",
        });
        expect(toFormError(apiError(400, "validation_failed", { details: [{ field: "login", code: "weird" }] }))).toEqual({
            kind: "unexpected",
        });
    });

    test("неизвестные пары отбрасываются, известные остаются", () => {
        const error = apiError(400, "validation_failed", {
            details: [
                { field: "login", code: "weird" },
                { field: "login", code: "too_long" },
                { field: "password", code: "invalid_format" },
            ],
        });

        expect(toFormError(error)).toEqual({ kind: "fields", fields: { login: "too_long" } });
    });

    test.each([
        [401, "auth_failed", { kind: "credentials" }],
        [409, "login_taken", { kind: "login_taken" }],
        [403, "user_disabled", { kind: "disabled" }],
        [403, "forbidden", { kind: "unavailable" }],
        [500, "internal_error", { kind: "unavailable" }],
        [503, null, { kind: "unavailable" }],
        [401, "unauthorized", { kind: "unexpected" }],
        [404, "not_found", { kind: "unexpected" }],
        [403, "csrf_invalid", { kind: "unexpected" }],
        [400, "bad_request", { kind: "unexpected" }],
    ])("%i %s → %j", (status, code, expected) => {
        const error = code ? apiError(status, code) : new ApiError(status, null);

        expect(toFormError(error)).toEqual(expected);
    });

    test("429 rate_limited: retryAfter берётся из ApiError.retryAfter", () => {
        expect(toFormError(apiError(429, "rate_limited", { retryAfter: 42 }))).toEqual({ kind: "rate_limited", retryAfter: 42 });
    });

    test("429 rate_limited без Retry-After → retryAfter: null", () => {
        expect(toFormError(apiError(429, "rate_limited"))).toEqual({ kind: "rate_limited", retryAfter: null });
    });

    test("сетевой сбой (TypeError от fetch) → unavailable, некорректный 2xx → unexpected", () => {
        expect(toFormError(new TypeError("Failed to fetch"))).toEqual({ kind: "unavailable" });
        expect(toFormError(new Error("Некорректный ответ POST /api/auth/login"))).toEqual({ kind: "unexpected" });
    });

    test("результат сериализуем: нет Error и функций", () => {
        const model = toFormError(apiError(429, "rate_limited", { retryAfter: 5 }));

        expect(JSON.parse(JSON.stringify(model))).toEqual(model);
    });
});
