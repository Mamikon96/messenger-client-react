import Chats from "./components/chats/Chats";
import Dialog from "./components/dialog/Dialog";
import RealtimeBanner from "./components/realtime-banner/RealtimeBanner";
import { useChatsLoader } from "./useChatsLoader";
import { useRealtime } from "./useRealtime";

import "./Messenger.css"

function Messenger() {
    const loadChats = useChatsLoader();
    useRealtime();

    return (
        <main className="messenger">
            <RealtimeBanner></RealtimeBanner>
            <div className="messenger__panels">
                <Chats onRetry={loadChats}></Chats>
                <Dialog></Dialog>
            </div>
        </main>
    );
}

export default Messenger;
