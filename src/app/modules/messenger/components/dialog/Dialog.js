import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectAuthUserId } from "../../../../reducers/auth";
import { selectActiveChat } from "../../../../reducers/activeChatId";
import { selectChatHistory, selectChatName } from "../../../../reducers/chats";
import { loadChatHistory } from "../../../../reducers/chatHistory";
import { selectChatOutbox } from "../../../../reducers/outbox";
import { MAX_MESSAGE_LENGTH, messageLength } from "../../../../services/messageLength";
import { selectUserEntities } from "../../../../reducers/users";
import { retryMessage, selectChatMessages, sendMessage } from "../../../../reducers/messages";
import "./Dialog.css";
import { Button } from "../../../ui/button/Button";
import { Input } from "../../../ui/input/Input";
import MessageStatus from "./MessageStatus";

function Dialog() {
    const activeChat = useSelector(selectActiveChat);
    const userId = useSelector(selectAuthUserId);
    const chatId = activeChat?.id;
    const chatMessages = useSelector((state) => selectChatMessages(state, chatId));
    const outbox = useSelector((state) => selectChatOutbox(state, chatId));
    const chatName = useSelector((state) => selectChatName(state, chatId));
    const historyStatus = useSelector((state) => selectChatHistory(state, chatId)?.status);
    const users = useSelector(selectUserEntities);
    const dispatch = useDispatch();
    const [text, setText] = useState("");
    const inputRef = useRef(null);
    const contentRef = useRef(null);

    const hasChat = Boolean(chatId);
    const showAuthors = activeChat?.type === "group";
    const showStatus = hasChat && !activeChat.local;
    const length = messageLength(text.trim());
    const tooLong = length > MAX_MESSAGE_LENGTH;

    const historyReady = activeChat?.local || historyStatus === "succeeded";
    const isEmpty = hasChat && historyReady && chatMessages.length === 0 && outbox.length === 0;

    useEffect(() => {
        if (chatId) dispatch(loadChatHistory(chatId));
    }, [chatId, dispatch]);

    useEffect(() => {
        const content = contentRef.current;
        if (content) content.scrollTop = content.scrollHeight;
    }, [chatId, chatMessages.length, outbox.length, historyStatus]);

    const send = () => {
        const trimmed = text.trim();
        if (hasChat && trimmed && userId && !tooLong) {
            dispatch(sendMessage({ chatId, senderId: userId, body: trimmed }));
            setText("");
        }
        inputRef.current?.focus();
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
                    {chatName}
                </div>
            </div>
            {historyStatus === "loading" && <div className="dialog__status" role="status">Загрузка сообщений…</div>}
            {historyStatus === "failed" && (
                <div className="dialog__status" role="alert">
                    <span>Не удалось загрузить сообщения.</span>
                    <Button onClick={() => dispatch(loadChatHistory(chatId))}>Повторить</Button>
                </div>
            )}
            <div className="dialog__content" role="log" aria-label="Сообщения" aria-busy={historyStatus === "loading"} ref={contentRef}>
                {!hasChat && <div className="dialog__status">Чат не выбран</div>}
                {isEmpty && <div className="dialog__status">Сообщений пока нет</div>}
                {chatMessages.map((message) => (
                    <div
                        key={message.seq}
                        role="article"
                        className={`dialog__message${message.senderId === userId ? " _own" : ""}`}
                    >
                        {showAuthors && message.senderId !== userId && users[message.senderId]?.name && (
                            <span className="dialog__message-author">{users[message.senderId]?.name}</span>
                        )}
                        {message.body}
                        {showStatus && message.senderId === userId && <MessageStatus status="sent" />}
                    </div>
                ))}
                {outbox.map((item) => (
                    <div key={item.clientId} role="article" className="dialog__message _own">
                        {item.body}
                        <MessageStatus status={item.status} onRetry={() => dispatch(retryMessage(item.clientId))} />
                    </div>
                ))}
            </div>
            <div className="dialog__footer">
                {tooLong && <p id="dialog-counter" className="dialog__counter" role="alert">{length} / {MAX_MESSAGE_LENGTH}</p>}
                <Input
                    multiline
                    ref={inputRef}
                    className="dialog__footer-input"
                    aria-label="Сообщение"
                    value={text}
                    disabled={!hasChat}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={handleKeyDown}
                    aria-invalid={tooLong ? "true" : undefined}
                    aria-describedby={tooLong ? "dialog-counter" : undefined}
                />
                <Button className="dialog__footer-send" disabled={!hasChat} onClick={send}>Send</Button>
            </div>
        </div>
    );
}

export default Dialog;
