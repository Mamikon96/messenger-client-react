import { useSelector } from "react-redux";
import { selectActiveChatId } from "../../../../reducers/activeChatId";
import { selectChatName } from "../../../../reducers/chats";
import "./Chat.css";

export const Chat = ({chat, onClick}) => {
    const activeChatId = useSelector(selectActiveChatId);
    const name = useSelector((state) => selectChatName(state, chat.id));

    return (
        <div className={`chat ${activeChatId === chat.id ? "_active" : ""}`} onClick={onClick}>
            <div className="chat__title">{name}</div>
            {chat.lastMessage && <div className="chat__last-message">{chat.lastMessage.body}</div>}
            {chat.unreadCount > 0 && <div className="chat__unread" data-testid="chat-unread">{chat.unreadCount}</div>}
            <div className="chat__members">
                <div className="chat__members-label">Members:</div>
                <div className="chat__members-count">{0}</div>
            </div>
        </div>
    );
}
