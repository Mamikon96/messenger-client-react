import { MAX_MESSAGE_LENGTH, messageLength } from "./messageLength";

describe("messageLength", () => {
    it("лимит — 4000", () => {
        expect(MAX_MESSAGE_LENGTH).toBe(4000);
    });

    it("считает символы как кодовые точки, а не единицы UTF-16", () => {
        expect(messageLength("abc")).toBe(3);
        expect(messageLength("😀😀")).toBe(2);
        expect(messageLength("")).toBe(0);
    });
});
