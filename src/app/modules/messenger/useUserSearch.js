import { useEffect, useState } from "react";
import { searchUsers } from "../../services/usersApi";

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 300;
const NO_RESULTS = [];

// Поиск людей по строке запроса. Статус выводится при рендере из query и ключа сохранённого ответа:
// ответ чужого (устаревшего) запроса не может показаться актуальным. Запрос уходит после паузы ввода,
// предыдущий отменяется (смена запроса, размонтирование).
export function useUserSearch() {
    const [query, setQuery] = useState("");
    const [search, setSearch] = useState({ key: "", status: "idle", results: NO_RESULTS });
    const trimmed = query.trim();

    useEffect(() => {
        if (trimmed.length < MIN_LENGTH) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            searchUsers(trimmed, { signal: controller.signal }).then(
                (results) => {
                    if (!controller.signal.aborted) setSearch({ key: trimmed, status: "succeeded", results });
                },
                () => {
                    if (!controller.signal.aborted) setSearch({ key: trimmed, status: "failed", results: NO_RESULTS });
                },
            );
        }, DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [trimmed]);

    if (trimmed.length < MIN_LENGTH) return { query, setQuery, results: NO_RESULTS, status: "idle" };
    if (search.key !== trimmed) return { query, setQuery, results: NO_RESULTS, status: "loading" };
    return { query, setQuery, results: search.results, status: search.status };
}
