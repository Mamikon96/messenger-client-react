import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Chat } from "../chat/Chat";
import { Button } from "../../../ui/button/Button";
import "./Chats.css";
import CreateGroup from "../create-group/CreateGroup";
import PeopleSearch from "../people-search/PeopleSearch";
import { useUserSearch } from "../../useUserSearch";
import { createDirectChat, selectChats, selectChatsStatus, selectPendingUserId } from "../../../../reducers/chats";
import { chatSelected } from "../../../../reducers/activeChatId";

const CREATE_ERRORS = {
    not_found: "Пользователь недоступен",
    failed: "Не удалось открыть чат.",
};

const WriteIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
);

function Chats({ onRetry }) {
    const chats = useSelector(selectChats);
    const status = useSelector(selectChatsStatus);
    const pendingUserId = useSelector(selectPendingUserId);
    const dispatch = useDispatch();
    const { query, setQuery, results, status: searchStatus } = useUserSearch();
    const [createError, setCreateError] = useState(null);

    const changeQuery = (value) => {
        setCreateError(null);
        setQuery(value);
    };

    const writeTo = (userId) => {
        setCreateError(null);
        dispatch(createDirectChat(userId)).then((result) => {
            if (createDirectChat.rejected.match(result) && !result.meta.aborted && result.payload !== "stale") setCreateError(CREATE_ERRORS[result.payload] ?? CREATE_ERRORS.failed);
        });
    };

    const getAction = (user) => ({
        label: `Написать ${user.name}`,
        icon: <WriteIcon />,
        disabled: pendingUserId !== null && user.id !== pendingUserId,
        busy: user.id === pendingUserId,
        onClick: () => writeTo(user.id),
    });

    const renderContent = () => {
        switch (status) {
            case "failed":
                return (
                    <div className="chats__status" role="alert">
                        <p className="chats__message">Не удалось загрузить чаты.</p>
                        <Button onClick={onRetry}>Повторить</Button>
                    </div>
                );
            case "succeeded":
                return chats.length === 0
                    ? <p className="chats__status" role="status">Чатов пока нет</p>
                    : chats.map((chat) => (
                        <Chat
                            key={chat.id}
                            chat={chat}
                            onClick={() => dispatch(chatSelected(chat.id))}
                        ></Chat>
                    ));
            default:
                return <p className="chats__status" role="status">Загрузка чатов…</p>;
        }
    }

    return (
        <div className="chats">
            <CreateGroup />
            <PeopleSearch
                query={query}
                onQueryChange={changeQuery}
                status={searchStatus}
                results={results}
                getAction={getAction}
                error={createError}
            />
            {renderContent()}
        </div>
    );
}

export default Chats
