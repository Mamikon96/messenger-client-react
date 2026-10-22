import { apiRequest } from "./apiClient";
import { expectShape, isUserList } from "./responseShape";

// Поиск людей по имени: UserDto[] (docs/client-integration.md). 401 unauthorized обрабатывает apiClient; ответ неверной формы — Error.
export async function searchUsers(q, { limit, signal } = {}) {
    const query = new URLSearchParams({ q });
    if (limit !== undefined) query.set("limit", limit);
    const data = await apiRequest(`/api/users?${query.toString()}`, { signal });
    return expectShape(data, isUserList, "GET /api/users");
}
