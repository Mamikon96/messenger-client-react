import { useSyncExternalStore } from "react";
import { getSnapshot, setMode, subscribe } from "./theme";

// { mode: 'light' | 'dark' | 'system', theme: 'light' | 'dark', setMode }
export default function useTheme() {
    const { mode, theme } = useSyncExternalStore(subscribe, getSnapshot);
    return { mode, theme, setMode };
}
