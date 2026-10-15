import { useDispatch, useSelector } from "react-redux";
import { Chat } from "../chat/Chat";
import "./Chats.css";
import { selectChats } from "../../../../reducers/chats";
import { chatSelected } from "../../../../reducers/activeChatId";

function Chats() {
    const chats = useSelector(selectChats);
    const dispatch = useDispatch();

    const handleClick = (chat) => {
        dispatch(chatSelected(chat.id));
    }

    return (
        <div className="chats">
            {
                chats ?
                chats.map((chat, index) => {
                    return (<Chat 
                                key={chat.id}
                                chat={chat}
                                onClick={handleClick.bind(this, chat)}
                            ></Chat>)
                }) : ""
            }
            {/* <Chat></Chat> */}
            {/* <Chat></Chat> */}
        </div>
    );
}

export default Chats