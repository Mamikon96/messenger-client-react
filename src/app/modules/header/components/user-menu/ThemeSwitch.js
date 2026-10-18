import useTheme from "../../../theme/useTheme";

const OPTIONS = [
    { mode: "light", label: "Светлая" },
    { mode: "dark", label: "Тёмная" },
    { mode: "system", label: "Как в системе" },
];

export const ThemeSwitch = () => {
    const { mode, setMode } = useTheme();

    return (
        <fieldset className="theme-switch">
            <legend className="theme-switch__legend">Тема</legend>
            {OPTIONS.map((option) => (
                <label key={option.mode} className="theme-switch__option">
                    <input
                        type="radio"
                        name="theme"
                        value={option.mode}
                        checked={mode === option.mode}
                        onChange={() => setMode(option.mode)}
                    />
                    {option.label}
                </label>
            ))}
        </fieldset>
    );
};
