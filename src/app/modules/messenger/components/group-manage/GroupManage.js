import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "../../../ui/button/Button";
import { Dialog } from "../../../ui/dialog/Dialog";
import { Input } from "../../../ui/input/Input";
import { removeChatMember, renameChat, selectChatById, selectIsChatOwner, selectIsGroupMember, selectManagingTarget } from "../../../../reducers/chats";
import { selectAuthUserId } from "../../../../reducers/auth";
import { selectUserEntities } from "../../../../reducers/users";
import { GROUP_TITLE_ERRORS, validateGroupTitle } from "../../groupTitle";
import "./GroupManage.css";

const TITLE_ERRORS = {
    invalid: GROUP_TITLE_ERRORS.invalid,
    forbidden: "Переименовать может только владелец группы.",
    not_found: "Группа не найдена.",
    failed: "Не удалось сохранить название.",
};

const REMOVE_ERRORS = {
    forbidden: "Убирать участников может только владелец группы.",
    not_found: "Группа или участник не найдены.",
    failed: "Не удалось убрать участника.",
};

const LEAVE_ERRORS = {
    forbidden: "Владелец не может выйти из группы.",
    not_found: "Группа не найдена.",
    failed: "Не удалось выйти из группы.",
};

// Отказ запроса, о котором стоит сообщить пользователю: не отмена, не пропущенный повтор и не сброс store.
const isReportable = (action, thunk) =>
    thunk.rejected.match(action) && !action.meta.aborted && !action.meta.condition && action.payload !== "stale";

// Содержимое окна: owner — переименование и «Убрать» у чужих, остальные — «Выйти из группы»; состав виден всем.
function ManageContent({ chatId }) {
    const dispatch = useDispatch();
    const isOwner = useSelector((state) => selectIsChatOwner(state, chatId));
    const chat = useSelector((state) => selectChatById(state, chatId));
    const meId = useSelector(selectAuthUserId);
    const users = useSelector(selectUserEntities);
    const target = useSelector(selectManagingTarget);
    const [title, setTitle] = useState(chat.title ?? "");
    const [titleError, setTitleError] = useState(null);
    const [actionError, setActionError] = useState(null);
    const busy = target !== null;

    const changeTitle = (value) => {
        setTitle(value);
        setTitleError(null);
    };

    const saveTitle = (event) => {
        event.preventDefault();
        const trimmed = title.trim();
        const invalid = validateGroupTitle(trimmed);
        setActionError(null);
        if (invalid) {
            setTitleError(invalid);
            return;
        }
        setTitleError(null);
        dispatch(renameChat({ chatId, title: trimmed })).then((result) => {
            if (isReportable(result, renameChat)) setTitleError(TITLE_ERRORS[result.payload] ?? TITLE_ERRORS.failed);
        });
    };

    const removeMember = (userId, errors) => {
        setActionError(null);
        setTitleError(null);
        dispatch(removeChatMember({ chatId, userId })).then((result) => {
            if (isReportable(result, removeChatMember)) setActionError(errors[result.payload] ?? errors.failed);
        });
    };

    return (
        <div className="group-manage">
            {isOwner && (
                <form className="group-manage__title" onSubmit={saveTitle} noValidate>
                    <Input type="text" label="Название группы" value={title} onChange={(event) => changeTitle(event.target.value)} error={titleError} autoComplete="off" />
                    <Button type="submit" loading={target === "title"} disabled={busy}>Сохранить</Button>
                </form>
            )}
            <ul className="group-manage__members">
                {(chat.members ?? []).map(({ userId }) => {
                    const name = users[userId]?.name ?? "";
                    return (
                        <li className="group-manage__member" key={userId}>
                            <span className="group-manage__member-name">{name}</span>
                            {isOwner && userId !== meId && (
                                <Button variant="ghost" aria-label={`Убрать ${name}`} loading={target === userId} disabled={busy} onClick={() => removeMember(userId, REMOVE_ERRORS)}>Убрать</Button>
                            )}
                        </li>
                    );
                })}
            </ul>
            {!isOwner && (
                <Button variant="secondary" loading={target === meId} disabled={busy} onClick={() => removeMember(meId, LEAVE_ERRORS)}>Выйти из группы</Button>
            )}
            {actionError && <p className="group-manage__error" role="alert">{actionError}</p>}
        </div>
    );
}

// Кнопка «Управление группой» (участнику группы) и окно управления.
function GroupManage({ chatId }) {
    const isMember = useSelector((state) => selectIsGroupMember(state, chatId));
    const [open, setOpen] = useState(false);

    if (!isMember) return null;

    return (
        <>
            <Button variant="secondary" onClick={() => setOpen(true)}>Управление группой</Button>
            {open && (
                <Dialog title="Управление группой" onClose={() => setOpen(false)}>
                    <ManageContent chatId={chatId} />
                </Dialog>
            )}
        </>
    );
}

export default GroupManage;
