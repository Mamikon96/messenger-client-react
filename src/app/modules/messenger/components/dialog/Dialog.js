import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addMessage } from "../../../../reducers/messages";
import "./Dialog.css";

function Dialog() {
    const activeChat = useSelector((state) => state.activeChat);
    const userId = useSelector((state) => state.auth.user?.id);
    const messages = useSelector((state) => state.messages);
    const dispatch = useDispatch();
    const [text, setText] = useState("");

    const hasChat = Boolean(activeChat.id);
    const chatMessages = messages.filter((message) => message.chatId === activeChat.id);

    const send = () => {
        const trimmed = text.trim();
        if (!hasChat || !trimmed || !userId) return;
        dispatch(addMessage({ chatId: activeChat.id, authorId: userId, text: trimmed }));
        setText("");
    }

    const handleKeyDown = (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
        }
    }

    return (
        <div className="dialog">
            <div className="dialog__header">
                <div className="dialog__header-title">
                    {activeChat.title}
                </div>
            </div>
            <div className="dialog__content">
                {chatMessages.map((message) => (
                    <div
                        key={message.id}
                        className={`dialog__message${message.authorId === userId ? " _own" : ""}`}
                    >
                        {message.text}
                    </div>
                ))}
            </div>
            <div className="dialog__footer">
                <textarea
                    className="dialog__footer-input"
                    aria-label="Сообщение"
                    value={text}
                    disabled={!hasChat}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={handleKeyDown}
                ></textarea>
                <button className="dialog__footer-send" disabled={!hasChat} onClick={send}>Send</button>
            </div>
        </div>
    );
}

export default Dialog;
