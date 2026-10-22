import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "../../../ui/button/Button";
import { Input } from "../../../ui/input/Input";
import { createGroupChat, selectIsCreatingGroup } from "../../../../reducers/chats";
import { GROUP_TITLE_ERRORS, validateGroupTitle } from "../../groupTitle";
import "./CreateGroup.css";

const FAILED = "Не удалось создать группу.";

// Кнопка «Новая группа» и форма с названием. Успех очищает и закрывает форму; открытие созданной группы — на слайсах (activeChatId).
function CreateGroup() {
    const dispatch = useDispatch();
    const creating = useSelector(selectIsCreatingGroup);
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [error, setError] = useState(null);
    const [failed, setFailed] = useState(false);
    const [focusRequest, setFocusRequest] = useState(0);
    const rootRef = useRef(null);

    // После закрытия формы кнопка «Новая группа» монтируется заново — фокус ставится на неё после рендера.
    useEffect(() => {
        if (!open && focusRequest > 0) rootRef.current?.querySelector("button")?.focus();
    }, [open, focusRequest]);

    const close = () => {
        setOpen(false);
        setTitle("");
        setError(null);
        setFailed(false);
        setFocusRequest((count) => count + 1);
    };

    const changeTitle = (value) => {
        setTitle(value);
        setError(null);
        setFailed(false);
    };

    const submit = (event) => {
        event.preventDefault();
        const trimmed = title.trim();
        const invalid = validateGroupTitle(trimmed);
        if (invalid) {
            setError(invalid);
            return;
        }
        setError(null);
        setFailed(false);
        dispatch(createGroupChat(trimmed)).then((result) => {
            if (createGroupChat.fulfilled.match(result)) {
                close();
                return;
            }
            if (!createGroupChat.rejected.match(result)) return;
            if (result.meta.aborted || result.meta.condition || result.payload === "stale") return;
            if (result.payload === "invalid") setError(GROUP_TITLE_ERRORS.invalid);
            else setFailed(true);
        });
    };

    if (!open) {
        return (
            <div className="create-group" ref={rootRef}>
                <Button variant="secondary" onClick={() => setOpen(true)}>Новая группа</Button>
            </div>
        );
    }

    return (
        <form className="create-group" ref={rootRef} onSubmit={submit} noValidate>
            <Input
                type="text"
                label="Название"
                value={title}
                onChange={(event) => changeTitle(event.target.value)}
                error={error}
                autoComplete="off"
                autoFocus
            />
            {failed && <p className="create-group__error" role="alert">{FAILED}</p>}
            <div className="create-group__actions">
                <Button type="submit" loading={creating}>Создать</Button>
                <Button variant="ghost" onClick={close} disabled={creating}>Отмена</Button>
            </div>
        </form>
    );
}

export default CreateGroup;
