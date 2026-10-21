import { Avatar } from "../../../ui/avatar/Avatar";
import { IconButton } from "../../../ui/icon-button/IconButton";

// Строка найденного человека: аватар, имя и одно действие (метка, иконка, блокировка, busy и обработчик задаёт родитель)
// busy — действие выполняется: кнопка остаётся в фокусе (aria-disabled), но клик игнорируется; disabled — недоступна..
export function UserRow({ user, action }) {
    return (
        <li className="people-search__row">
            <Avatar src={user.avatarUrl} name={user.name} id={user.id} size="sm" />
            <span className="people-search__name">{user.name}</span>
            <IconButton
                label={action.label}
                disabled={action.disabled}
                aria-busy={action.busy || undefined}
                aria-disabled={action.busy || undefined}
                onClick={action.busy ? undefined : action.onClick}
            >
                {action.icon}
            </IconButton>
        </li>
    );
}
