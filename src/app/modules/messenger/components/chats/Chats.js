import { useDispatch, useSelector } from "react-redux";
import { Chat } from "../chat/Chat";
import "./Chats.css";
import { setActiveChat } from "../../../../reducers/activeChat";

function Chats() {
    const chats = useSelector((state) => state.chats);
    const dispatch = useDispatch();

    const handleClick = (chat) => {
        dispatch(setActiveChat(chat));
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