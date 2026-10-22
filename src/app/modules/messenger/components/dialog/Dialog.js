import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectAuthUserId } from "../../../../reducers/auth";
import { chatSelected, selectActiveChat } from "../../../../reducers/activeChatId";
import { selectChatHistory, selectChatMembersCount, selectChatName, selectChatReadSeq } from "../../../../reducers/chats";
import { loadChatHistory, loadOlderMessages } from "../../../../reducers/chatHistory";
import { selectChatOutbox } from "../../../../reducers/outbox";
import { MAX_MESSAGE_LENGTH, messageLength } from "../../../../services/messageLength";
import { selectUserEntities } from "../../../../reducers/users";
import { retryMessage, selectChatMessages, sendMessage } from "../../../../reducers/messages";
import "./Dialog.css";
import { Button } from "../../../ui/button/Button";
import { Input } from "../../../ui/input/Input";
import MessageStatus from "./MessageStatus";
import InviteMembers from "../invite/InviteMembers";
import GroupManage from "../group-manage/GroupManage";
import { useReadReceipts } from "../../useReadReceipts";

// Расстояние в пикселях от края ленты, в пределах которого пользователь считается «у края»: у низа — следуем за новыми, у верха — подкачиваем старые.
const EDGE_THRESHOLD = 50;

// «1 участник», «2 участника», «5 участников», «11 участников»: форма по последним цифрам числа.
const membersLabel = (count) => {
    const lastTwo = count % 100;
    const last = count % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return `${count} участников`;
    if (last === 1) return `${count} участник`;
    if (last >= 2 && last <= 4) return `${count} участника`;
    return `${count} участников`;
}

function Dialog() {
    const activeChat = useSelector(selectActiveChat);
    const userId = useSelector(selectAuthUserId);
    const chatId = activeChat?.id;
    const chatMessages = useSelector((state) => selectChatMessages(state, chatId));
    const outbox = useSelector((state) => selectChatOutbox(state, chatId));
    const chatName = useSelector((state) => selectChatName(state, chatId));
    const membersCount = useSelector((state) => selectChatMembersCount(state, chatId));
    const readSeq = useSelector((state) => selectChatReadSeq(state, chatId));
    const history = useSelector((state) => selectChatHistory(state, chatId));
    const historyStatus = history?.status;
    const olderStatus = history?.olderStatus;
    const hasMore = Boolean(history?.hasMore);
    const users = useSelector(selectUserEntities);
    const dispatch = useDispatch();
    const [text, setText] = useState("");
    const inputRef = useRef(null);
    const contentRef = useRef(null);
    const atBottomRef = useRef(true);
    const snapshotRef = useRef(null);
    const emptyRef = useRef(null);
    const hadChatRef = useRef(false);

    const hasChat = Boolean(chatId);
    const showAuthors = activeChat?.type === "group";
    const showStatus = hasChat && !activeChat.local;
    const length = messageLength(text.trim());
    const tooLong = length > MAX_MESSAGE_LENGTH;

    const historyReady = activeChat?.local || historyStatus === "succeeded";
    const isEmpty = hasChat && historyReady && chatMessages.length === 0 && outbox.length === 0;

    // Чат потерян (выход из группы, chat.removed): кнопка-триггер размонтирована и фокус ушёл на body — переводим его на заголовок пустого состояния.
    // Фокус в другом поле не трогаем. На ширине <768px `.dialog` скрыт, focus() там не срабатывает.
    useEffect(() => {
        const lost = !document.activeElement || document.activeElement === document.body;
        if (hadChatRef.current && !chatId && lost) emptyRef.current?.focus();
        hadChatRef.current = Boolean(chatId);
    }, [chatId]);

    useEffect(() => {
        if (chatId) dispatch(loadChatHistory(chatId));
    }, [chatId, dispatch]);

    const firstSeq = chatMessages[0]?.seq;
    const lastMessage = chatMessages[chatMessages.length - 1];
    const lastSeq = lastMessage?.seq;
    const lastIsOwn = lastMessage?.senderId === userId;
    const canLoadOlder = historyStatus === "succeeded" && hasMore && olderStatus !== "loading" && olderStatus !== "failed";

    const notifyRead = useReadReceipts({ chatId, lastSeq, enabled: hasChat && !activeChat.local && historyStatus === "succeeded", atBottomRef });

    // Позиция ленты после изменения содержимого: вниз — при смене чата, первой загрузке, своём сообщении и если читали у низа;
    // подкачка старых сверху сдвигает scrollTop на добавленную высоту, чтобы прочитанное не уехало.
    useLayoutEffect(() => {
        const content = contentRef.current;
        if (!content) return;
        const prev = snapshotRef.current;
        const count = chatMessages.length;
        const prepended = prev && prev.chatId === chatId && firstSeq < prev.firstSeq;
        const grew = prev && (count > prev.count || outbox.length > prev.outboxCount);
        // Подтверждение отправленного (элемент уходит из outbox, сообщение появляется) не прокручивает: к низу лента ушла при постановке в очередь.
        const own = prev && (outbox.length > prev.outboxCount || (lastSeq > (prev.lastSeq ?? 0) && lastIsOwn && outbox.length >= prev.outboxCount));
        if (!prev || prev.chatId !== chatId || prev.historyStatus !== historyStatus || own || (grew && !prepended && atBottomRef.current)) {
            content.scrollTop = content.scrollHeight;
            atBottomRef.current = true;
        } else if (prepended) {
            content.scrollTop += content.scrollHeight - prev.scrollHeight;
        }
        snapshotRef.current = { chatId, historyStatus, firstSeq, lastSeq, count, outboxCount: outbox.length, scrollHeight: content.scrollHeight };
    }, [chatId, historyStatus, firstSeq, lastSeq, lastIsOwn, chatMessages.length, outbox.length]);

    // Лента короче окна не прокручивается, и событие scroll не придёт: подкачиваем, пока история не заполнит окно.
    useEffect(() => {
        const content = contentRef.current;
        if (canLoadOlder && content && content.scrollHeight <= content.clientHeight) dispatch(loadOlderMessages(chatId));
    }, [canLoadOlder, chatId, dispatch]);

    const handleScroll = (event) => {
        const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
        atBottomRef.current = scrollHeight - scrollTop - clientHeight <= EDGE_THRESHOLD;
        if (atBottomRef.current) notifyRead();
        if (canLoadOlder && scrollTop <= EDGE_THRESHOLD) dispatch(loadOlderMessages(chatId));
    }

    // Повтор отправки с клавиатуры: кнопка исчезает вместе со статусом failed, фокус переводим в поле ввода, чтобы он не ушёл на body.
    const retry = (clientId) => {
        dispatch(retryMessage(clientId));
        inputRef.current?.focus();
    }

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
                <Button variant="ghost" className="dialog__back" onClick={() => dispatch(chatSelected(null))}>Назад</Button>
                <div className="dialog__header-title">
                    {chatName}
                </div>
                {membersCount !== null && <div className="dialog__header-meta">{membersLabel(membersCount)}</div>}
                {hasChat && <InviteMembers chatId={chatId} />}
                {hasChat && <GroupManage chatId={chatId} />}
            </div>
            {historyStatus === "loading" && <div className="dialog__status" role="status">Загрузка сообщений…</div>}
            {historyStatus === "failed" && (
                <div className="dialog__status" role="alert">
                    <span>Не удалось загрузить сообщения.</span>
                    <Button onClick={() => dispatch(loadChatHistory(chatId))}>Повторить</Button>
                </div>
            )}
            {olderStatus === "loading" && <div className="dialog__status" role="status">Загрузка старых сообщений…</div>}
            {olderStatus === "failed" && (
                <div className="dialog__status" role="alert">
                    <span>Не удалось загрузить старые сообщения.</span>
                    <Button onClick={() => dispatch(loadOlderMessages(chatId))}>Повторить</Button>
                </div>
            )}
            <div className="dialog__content" role="log" aria-label="Сообщения" aria-busy={historyStatus === "loading"} ref={contentRef} onScroll={handleScroll}>
                {!hasChat && <div className="dialog__status" tabIndex={-1} ref={emptyRef}>Чат не выбран</div>}
                {isEmpty && <div className="dialog__status">Сообщений пока нет</div>}
                {chatMessages.map((message) => {
                    const own = message.senderId === userId;
                    return (
                        <div key={message.seq} role="article" className={`dialog__row${own ? " _own" : ""}`}>
                            <div className={`dialog__message${own ? " _own" : ""}`}>
                                {showAuthors && !own && users[message.senderId]?.name && (
                                    <span className="dialog__message-author">{users[message.senderId]?.name}</span>
                                )}
                                {message.body}
                                {showStatus && own && <MessageStatus status={typeof readSeq === "number" && message.seq <= readSeq ? "read" : "sent"} />}
                            </div>
                        </div>
                    );
                })}
                {outbox.map((item) => {
                    const failed = item.status === "failed";
                    const status = <MessageStatus status={item.status} onRetry={() => retry(item.clientId)} />;
                    return (
                        <div key={item.clientId} role="article" className="dialog__row _own">
                            <div className="dialog__message _own">
                                {item.body}
                                {!failed && status}
                            </div>
                            {failed && status}
                        </div>
                    );
                })}
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
