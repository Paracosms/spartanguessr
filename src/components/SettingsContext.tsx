import {createContext, useContext, useMemo, useState} from 'react';

const SettingsContext = createContext(null);

const defaultSettings = {
    difficulty: "Easy",
    rounds: 1,
};

export function SettingsProvider({children}) {
    const [settings, setSettings] = useState(defaultSettings);

    const setSetting = (key, value) => {
        setSettings((prev) => ({...prev, [key]: value}));
    };

    const value = useMemo(
        () => ({settings, setSettings, setSetting}),
        [settings]
    );

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new  Error('useSettings must be used within SettingsProvider');
    return ctx;
}