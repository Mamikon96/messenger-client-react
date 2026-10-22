export const MAX_GROUP_TITLE_LENGTH = 100;

export const GROUP_TITLE_ERRORS = {
    required: "Введите название группы",
    tooLong: `Название не длиннее ${MAX_GROUP_TITLE_LENGTH} символов`,
    invalid: "Название не подходит. Измените его и повторите.",
};

// Длина — в единицах UTF-16 (как на сервере), название — после trim. Возвращает текст ошибки или null.
export const validateGroupTitle = (trimmed) => {
    if (trimmed === "") return GROUP_TITLE_ERRORS.required;
    return trimmed.length > MAX_GROUP_TITLE_LENGTH ? GROUP_TITLE_ERRORS.tooLong : null;
};
