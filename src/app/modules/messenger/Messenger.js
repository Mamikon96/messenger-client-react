import Chats from "./components/chats/Chats";
import Dialog from "./components/dialog/Dialog";

import "./Messenger.css"

function Messenger() {
    return (
        <div className="messenger _dark">
            <Chats></Chats>
            <Dialog></Dialog>
        </div>
    );
}

export default Messenger;