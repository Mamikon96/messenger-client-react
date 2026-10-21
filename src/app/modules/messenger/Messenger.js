import { useSelector } from "react-redux";
import { selectActiveChatId } from "../../reducers/activeChatId";
import Chats from "./components/chats/Chats";
import Dialog from "./components/dialog/Dialog";
import RealtimeBanner from "./components/realtime-banner/RealtimeBanner";
import { useChatsLoader } from "./useChatsLoader";
import { useRealtime } from "./useRealtime";

import "./Messenger.css"

function Messenger() {
    const loadChats = useChatsLoader();
    useRealtime();
    const chatOpen = useSelector(selectActiveChatId) !== null;

    return (
        <main className="messenger">
            <RealtimeBanner></RealtimeBanner>
            <div className={`messenger__panels${chatOpen ? " _chat-open" : ""}`}>
                <Chats onRetry={loadChats}></Chats>
                <Dialog></Dialog>
            </div>
        </main>
    );
}

export default Messenger;
