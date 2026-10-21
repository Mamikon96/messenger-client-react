import { apiRequest } from "./apiClient";

// Поиск людей по имени: UserDto[] (docs/client-integration.md). 401 unauthorized обрабатывает apiClient.
export function searchUsers(q, { limit, signal } = {}) {
    const query = new URLSearchParams({ q });
    if (limit !== undefined) query.set("limit", limit);
    return apiRequest(`/api/users?${query.toString()}`, { signal });
}
