// Проверка формы тела успешного ответа на границе API (docs/client-integration.md, §4).
// Неверная форма — такая же ошибка запроса, как сбой сети: битые элементы молча не отбрасываются.
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value) => typeof value === "string";
const isNonEmptyString = (value) => isString(value) && value !== "";
const isCount = (value) => Number.isInteger(value) && value >= 0;
const isArrayOf = (isItem) => (value) => Array.isArray(value) && value.every(isItem);

// UserSummary; name и avatarUrl могут быть "".
export const isUserSummary = (value) => isObject(value) && isNonEmptyString(value.id) && isString(value.name) && isString(value.avatarUrl);

const isChatMember = (value) =>
    isObject(value) &&
    isNonEmptyString(value.userId) &&
    isString(value.name) &&
    isString(value.avatarUrl) &&
    (value.role === "owner" || value.role === "member");

export const isChatMessage = (value) =>
    isObject(value) &&
    isNonEmptyString(value.chatId) &&
    isCount(value.seq) &&
    isNonEmptyString(value.senderId) &&
    isNonEmptyString(value.clientId) &&
    isString(value.body) &&
    isNonEmptyString(value.createdAt);

const isChatHead = (value) =>
    isObject(value) &&
    isNonEmptyString(value.id) &&
    (value.type === "direct" || value.type === "group") &&
    (value.title === null || isString(value.title)) &&
    isCount(value.lastSeq);

export const isChat = (value) => isChatHead(value) && isArrayOf(isChatMember)(value.members);

const isChatListItem = (value) =>
    isChatHead(value) &&
    (value.lastMessage === null || isChatMessage(value.lastMessage)) &&
    isCount(value.unreadCount) &&
    (value.peer === undefined || isUserSummary(value.peer));

export const isUserList = isArrayOf(isUserSummary);
export const isChatList = isArrayOf(isChatListItem);
export const isMessagePage = (value) => isObject(value) && isArrayOf(isChatMessage)(value.messages) && typeof value.hasMore === "boolean";

// Возвращает data без изменений, если форма верна; иначе бросает Error, как acceptSession в authApi.
export function expectShape(data, isValid, endpoint) {
    if (!isValid(data)) {
        throw new Error(`Некорректный ответ ${endpoint}`);
    }
    return data;
}
