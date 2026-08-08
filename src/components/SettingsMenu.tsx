import Form from "react-bootstrap/Form";

type SettingsMenuProps = {
    difficulty: string;
    onDifficultyChange: (difficulty: string) => void;
    unlabeledMap: boolean;
    onUnlabeledMapChange: (value: boolean) => void;
    roundCount: number;
    onRoundCountChange: (value: number) => void;
    timerLength: string;
    onTimerLengthChange: (value: string) => void;
    seed: string;
    onSeedChange: (value: string) => void;
    outsideOnly: boolean;
    onOutsideOnlyChange: (value: boolean) => void;
    leaderboardMode: boolean;
};

const TIMER_DISPLAY: Record<string, string> = {
    none: "None",
    "30": "30s",
    "60": "60s",
    "120": "120s",
};

const DIFFICULTIES = ["Easy", "Medium", "Hard"];
const ROUND_COUNTS = [3, 5, 10];
const TIMER_LENGTHS = ["none", "30", "60", "120"];

export default function SettingsMenu({
    difficulty,
    onDifficultyChange,
    unlabeledMap,
    onUnlabeledMapChange,
    roundCount,
    onRoundCountChange,
    timerLength,
    onTimerLengthChange,
    seed,
    onSeedChange,
    outsideOnly,
    onOutsideOnlyChange,
    leaderboardMode,
}: SettingsMenuProps) {
    return (
        <>
            <div className="settings-grid">
                <fieldset className="setting-field">
                    <legend>Difficulty</legend>
                    <div className="setting-options">
                        {DIFFICULTIES.map((option) => (
                            <button
                                className={difficulty === option ? "is-selected" : ""}
                                type="button"
                                aria-pressed={difficulty === option}
                                disabled={leaderboardMode}
                                onClick={() => onDifficultyChange(option)}
                                key={option}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <fieldset className="setting-field">
                    <legend>Rounds</legend>
                    <div className="setting-options">
                        {ROUND_COUNTS.map((option) => (
                            <button
                                className={roundCount === option ? "is-selected" : ""}
                                type="button"
                                aria-pressed={roundCount === option}
                                disabled={leaderboardMode}
                                onClick={() => onRoundCountChange(option)}
                                key={option}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <fieldset className="setting-field setting-field-wide">
                    <legend>Time limit</legend>
                    <div className="setting-options setting-options-timer">
                        {TIMER_LENGTHS.map((option) => (
                            <button
                                className={timerLength === option ? "is-selected" : ""}
                                type="button"
                                aria-pressed={timerLength === option}
                                disabled={leaderboardMode}
                                onClick={() => onTimerLengthChange(option)}
                                key={option}
                            >
                                {TIMER_DISPLAY[option]}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <label className="setting-field setting-field-wide">
                    <span>Seed</span>
                    <input
                        className="setting-input"
                        type="text"
                        placeholder="Optional"
                        value={seed}
                        onChange={(e) => onSeedChange(e.target.value)}
                        disabled={leaderboardMode}
                    />
                </label>
            </div>

            <div className="settings-toggles">
                <label className={`setting-toggle${leaderboardMode ? " is-disabled" : ""}`} htmlFor="unlabeled-map-switch">
                    <span><strong>Hide map labels</strong><small>Removes labels from the map</small></span>
                    <Form.Check
                        type="switch"
                        id="unlabeled-map-switch"
                        checked={unlabeledMap}
                        onChange={(e) => onUnlabeledMapChange(e.target.checked)}
                        disabled={leaderboardMode}
                    />
                </label>

                <label className={`setting-toggle${leaderboardMode ? " is-disabled" : ""}`} htmlFor="outside-only-switch">
                    <span><strong>Outdoor locations only</strong><small>Skip indoor locations</small></span>
                    <Form.Check
                        type="switch"
                        id="outside-only-switch"
                        checked={outsideOnly}
                        onChange={(e) => onOutsideOnlyChange(e.target.checked)}
                        disabled={leaderboardMode}
                    />
                </label>
            </div>
        </>
    );
}
