import { useSelector } from "react-redux";
import { selectActiveChatId } from "../../../../reducers/activeChatId";
import "./Chat.css";

export const Chat = ({chat, onClick}) => {
    const activeChatId = useSelector(selectActiveChatId);

    return (
        <div className={`chat ${activeChatId === chat.id ? "_active" : ""}`} onClick={onClick}>
            <div className="chat__title">{chat.title}</div>
            <div className="chat__members">
                <div className="chat__members-label">Members:</div>
                <div className="chat__members-count">{0}</div>
            </div>
        </div>
    );
}