import "./Login.css";

const PROVIDERS = [
    { id: "google", title: "Войти через Google" },
    { id: "github", title: "Войти через GitHub" },
];

// Ссылки, а не fetch: вход начинается полной навигацией браузера на BFF.
export default function Login() {
    return (
        <div className="login">
            {PROVIDERS.map(({ id, title }) => (
                <a key={id} className="login__provider" href={`/api/auth/${id}/start`}>{title}</a>
            ))}
        </div>
    );
}
