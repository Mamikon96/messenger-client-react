import { useState } from "react";
import "./Avatar.css";

export function getInitials(name) {
    const words = (name || "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    return words.slice(0, 2).map((word) => Array.from(word)[0].toUpperCase()).join("");
}

// Фон инициалов — осознанное исключение из токенов: оттенок выводится из id (или имени), один человек всегда одного цвета.
// Насыщенность и светлость фиксированы, чтобы белый текст держал контраст AA при любом оттенке.
const SATURATION = 45;
const LIGHTNESS = 36;

function colorFor(seed) {
    let hash = 0;
    for (const char of String(seed || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return `hsl(${(hash * 137) % 360}, ${SATURATION}%, ${LIGHTNESS}%)`;
}

// size: sm | md | lg. При отсутствии src или ошибке загрузки показываются инициалы.
export const Avatar = ({ src, name, id, size = "md", className = "" }) => {
    // Помним, какой именно src не загрузился: новый src пробуется сразу, без кадра с инициалами.
    const [failedSrc, setFailedSrc] = useState(null);
    const failed = failedSrc === src;

    const classes = `avatar _${size} ${className}`.trim();

    if (src && !failed) {
        return (
            <span className={classes}>
                <img className="avatar__image" src={src} alt={name || ""} onError={() => setFailedSrc(src)} />
            </span>
        );
    }

    return (
        <span className={classes} role="img" aria-label={name || "Пользователь"} style={{ backgroundColor: colorFor(id ?? name) }}>
            <span className="avatar__initials" aria-hidden="true">{getInitials(name)}</span>
        </span>
    );
};
