import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectAuthUserId } from "../../../../reducers/auth";
import { selectActiveChat } from "../../../../reducers/activeChatId";
import { selectChatMessages, sendMessage } from "../../../../reducers/messages";
import "./Dialog.css";
import { Button } from "../../../ui/button/Button";
import { Input } from "../../../ui/input/Input";

function Dialog() {
    const activeChat = useSelector(selectActiveChat);
    const userId = useSelector(selectAuthUserId);
    const chatId = activeChat?.id;
    const chatMessages = useSelector((state) => selectChatMessages(state, chatId));
    const dispatch = useDispatch();
    const [text, setText] = useState("");

    const hasChat = Boolean(chatId);

    const send = () => {
        const trimmed = text.trim();
        if (!hasChat || !trimmed || !userId) return;
        dispatch(sendMessage({ chatId, senderId: userId, body: trimmed }));
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
                    {activeChat?.title}
                </div>
            </div>
            <div className="dialog__content">
                {chatMessages.map((message) => (
                    <div
                        key={message.seq}
                        className={`dialog__message${message.senderId === userId ? " _own" : ""}`}
                    >
                        {message.body}
                    </div>
                ))}
            </div>
            <div className="dialog__footer">
                <Input
                    multiline
                    className="dialog__footer-input"
                    aria-label="Сообщение"
                    value={text}
                    disabled={!hasChat}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <Button className="dialog__footer-send" disabled={!hasChat} onClick={send}>Send</Button>
            </div>
        </div>
    );
}

export default Dialog;
