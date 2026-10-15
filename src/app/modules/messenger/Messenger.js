import Chats from "./components/chats/Chats";
import Dialog from "./components/dialog/Dialog";
import { useChatsLoader } from "./useChatsLoader";

import "./Messenger.css"

function Messenger() {
    const loadChats = useChatsLoader();

    return (
        <div className="messenger">
            <Chats onRetry={loadChats}></Chats>
            <Dialog></Dialog>
        </div>
    );
}

export default Messenger;
