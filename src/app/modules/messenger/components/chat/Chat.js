import { useSelector } from "react-redux";
import "./Chat.css";

export const Chat = ({chat, onClick}) => {
    const activeChat = useSelector((state) => state.activeChat);

    return (
        <div className={`chat ${activeChat.id === chat.id ? "_active" : ""}`} onClick={onClick}>
            <div className="chat__title">{chat.title}</div>
            <div className="chat__members">
                <div className="chat__members-label">Members:</div>
                <div className="chat__members-count">{0}</div>
            </div>
        </div>
    );
}