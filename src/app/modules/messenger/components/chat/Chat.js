import { useSelector } from "react-redux";
import { selectActiveChatId } from "../../../../reducers/activeChatId";
import { selectChatName } from "../../../../reducers/chats";
import { selectUserById } from "../../../../reducers/users";
import { Avatar } from "../../../ui/avatar/Avatar";
import "./Chat.css";

export const Chat = ({ chat, onClick }) => {
    const active = useSelector(selectActiveChatId) === chat.id;
    const name = useSelector((state) => selectChatName(state, chat.id));
    // У direct аватар — собеседника; у группы своего изображения нет, показываются инициалы названия.
    const avatarUrl = useSelector((state) => (chat.peerId ? selectUserById(state, chat.peerId)?.avatarUrl : undefined));

    return (
        <button type="button" className={`chat ${active ? "_active" : ""}`.trim()} aria-current={active ? "true" : undefined} onClick={onClick}>
            <span className="chat__avatar" aria-hidden="true">
                <Avatar src={avatarUrl} name={name} id={chat.peerId ?? chat.id} />
            </span>
            <span className="chat__body">
                <span className="chat__title">{name}</span>
                {chat.lastMessage && <span className="chat__last-message">{chat.lastMessage.body}</span>}
            </span>
            {chat.unreadCount > 0 && <span className="chat__unread" aria-label={`${chat.unreadCount} непрочитанных`} data-testid="chat-unread">{chat.unreadCount}</span>}
        </button>
    );
}
