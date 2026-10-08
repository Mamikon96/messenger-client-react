# Контракт auth API (история FE-09)
> Заменён: источник истины по API — `docs/client-integration.md` (поставляет бэкенд `messenger-server`, локальная копия лежит вне git — в `.gitignore`), решение FE-D12 (`decisions.md`). Файл оставлен ради ссылок и истории; новое поведение сюда не вносить.

## Где что искать в `docs/client-integration.md`
| Тема | Раздел |
|---|---|
| Адреса, same-origin, cookie, формат ошибок `{error:{code,message}}` | 1 |
| Вход OAuth, `auth_error` (5 кодов), сессия, `GET /api/auth/session`, CSRF, logout, признак «не авторизован» | 2 |
| Коды закрытия WebSocket (`4401`, `4008`, `1006`) | 5.3 |

## Что изменилось относительно FE-09 (до FE-D12)
- Ошибки — JSON `{error:{code,message}}`; клиент опирается на `error.code` и HTTP-статус, не на `message`.
- `403` бывает `csrf_invalid` (перечитать сессию и один раз повторить) и `forbidden` (выход не означает).
- `auth_error`: добавились `not_allowed` и `login_taken` (всего пять).
- Cookie сессии `Secure` — только если `PUBLIC_URL` на https (раньше считалось «всегда»).
- `logout` — `204` без тела; сокеты закрываются кодом `4401` за ≤ 30 с. Повторный вход уничтожает старую сессию.
- Неизвестный провайдер — `404 not_found` (JSON).
