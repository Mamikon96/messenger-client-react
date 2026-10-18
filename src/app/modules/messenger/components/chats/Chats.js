import { useDispatch, useSelector } from "react-redux";
import { Chat } from "../chat/Chat";
import { Button } from "../../../ui/button/Button";
import "./Chats.css";
import { selectChats, selectChatsStatus } from "../../../../reducers/chats";
import { chatSelected } from "../../../../reducers/activeChatId";

function Chats({ onRetry }) {
    const chats = useSelector(selectChats);
    const status = useSelector(selectChatsStatus);
    const dispatch = useDispatch();

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
            {renderContent()}
        </div>
    );
}

export default Chats
