import { Input } from "../../../ui/input/Input";
import { UserRow } from "./UserRow";
import "./PeopleSearch.css";

// Поле поиска людей и блок «Люди» с результатами. Состояние поиска и действие над человеком приходят снаружи:
// getAction(user) → { label, icon, disabled, busy, onClick }; error — ошибка действия (например, не удалось открыть чат).
function PeopleSearch({ query, onQueryChange, status, results, getAction, error }) {
    // Live-область смонтирована всегда (вне условного блока): скринридер озвучивает смену текста; видимый дубль скрыт через aria-hidden.
    const statusText = () => {
        if (status === "loading") return "Поиск…";
        if (status !== "succeeded") return "";
        return results.length === 0 ? "Никого не найдено" : `Найдено: ${results.length}`;
    };
    const hasList = status === "succeeded" && results.length > 0;

    return (
        <section className="people-search">
            <Input
                type="text"
                label="Поиск людей"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                autoComplete="off"
            />
            <p className="people-search__sr-only" role="status">{statusText()}</p>
            {status !== "idle" && (
                <div className="people-search__result">
                    <h3 className="people-search__title">Люди</h3>
                    {!hasList && status !== "failed" && <p className="people-search__status" aria-hidden="true">{statusText()}</p>}
                    {status === "failed" && <p className="people-search__status" role="alert">Не удалось выполнить поиск.</p>}
                    {hasList && (
                        <ul className="people-search__list">
                            {results.map((user) => <UserRow key={user.id} user={user} action={getAction(user)} />)}
                        </ul>
                    )}
                    {error && <p className="people-search__status" role="alert">{error}</p>}
                </div>
            )}
        </section>
    );
}

export default PeopleSearch;
