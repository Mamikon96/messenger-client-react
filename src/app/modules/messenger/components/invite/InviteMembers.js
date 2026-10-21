import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "../../../ui/button/Button";
import { Dialog } from "../../../ui/dialog/Dialog";
import PeopleSearch from "../people-search/PeopleSearch";
import { useUserSearch } from "../../useUserSearch";
import { addChatMember, selectChatById, selectInvitingUserId, selectIsChatOwner } from "../../../../reducers/chats";

const INVITE_ERRORS = {
    forbidden: "Приглашать может только владелец группы.",
    not_found: "Группа или человек не найдены.",
    limit: "В группе не больше 100 участников.",
    failed: "Не удалось пригласить.",
};

const InviteIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
    </svg>
);

// Содержимое окна: поиск людей и действие «Пригласить <имя>»; состояние поиска живёт, пока окно открыто.
function InviteSearch({ chatId }) {
    const dispatch = useDispatch();
    const members = useSelector((state) => selectChatById(state, chatId)?.members);
    const invitingUserId = useSelector(selectInvitingUserId);
    const { query, setQuery, results, status } = useUserSearch();
    const [error, setError] = useState(null);

    const changeQuery = (value) => {
        setError(null);
        setQuery(value);
    };

    const invite = (userId) => {
        setError(null);
        dispatch(addChatMember({ chatId, userId })).then((result) => {
            if (!addChatMember.rejected.match(result) || result.meta.aborted || result.meta.condition || result.payload === "stale") return;
            setError(INVITE_ERRORS[result.payload] ?? INVITE_ERRORS.failed);
        });
    };

    const getAction = (user) => {
        const inChat = members?.some(({ userId }) => userId === user.id) ?? false;
        return {
            label: inChat ? `Пригласить ${user.name}: уже в чате` : `Пригласить ${user.name}`,
            icon: <InviteIcon />,
            disabled: inChat || (invitingUserId !== null && user.id !== invitingUserId),
            busy: user.id === invitingUserId,
            onClick: () => invite(user.id),
        };
    };

    return <PeopleSearch query={query} onQueryChange={changeQuery} status={status} results={results} getAction={getAction} error={error} />;
}

// Кнопка «Пригласить» (только у owner группы) и окно с поиском людей; приглашение сразу добавляет человека в группу.
function InviteMembers({ chatId }) {
    const isOwner = useSelector((state) => selectIsChatOwner(state, chatId));
    const [open, setOpen] = useState(false);

    if (!isOwner) return null;

    return (
        <>
            <Button variant="secondary" onClick={() => setOpen(true)}>Пригласить</Button>
            {open && (
                <Dialog title="Пригласить в группу" onClose={() => setOpen(false)}>
                    <InviteSearch chatId={chatId} />
                </Dialog>
            )}
        </>
    );
}

export default InviteMembers;
