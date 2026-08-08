import Dropdown from "react-bootstrap/Dropdown";
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
                <div className="setting-field">
                    <span>Difficulty</span>
                    <Dropdown onSelect={(eventKey) => eventKey && onDifficultyChange(eventKey)}>
                        <Dropdown.Toggle className="difficulty-button" id="difficulty-dropdown" disabled={leaderboardMode}>
                            {difficulty}
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                            <Dropdown.Item eventKey="Easy">Easy</Dropdown.Item>
                            <Dropdown.Item eventKey="Medium">Medium</Dropdown.Item>
                            <Dropdown.Item eventKey="Hard">Hard</Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown>
                </div>

                <div className="setting-field">
                    <span>Timer</span>
                    <Dropdown onSelect={(eventKey) => eventKey && onTimerLengthChange(eventKey)}>
                        <Dropdown.Toggle className="difficulty-button" id="timer-dropdown" disabled={leaderboardMode}>
                            {TIMER_DISPLAY[timerLength] ?? timerLength}
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                            <Dropdown.Item eventKey="none">None</Dropdown.Item>
                            <Dropdown.Item eventKey="30">30s</Dropdown.Item>
                            <Dropdown.Item eventKey="60">60s</Dropdown.Item>
                            <Dropdown.Item eventKey="120">120s</Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown>
                </div>

                <div className="setting-field">
                    <span>Rounds</span>
                    <Dropdown
                        onSelect={(eventKey) => {
                            const nextRoundCount = Number(eventKey);
                            if (Number.isInteger(nextRoundCount) && nextRoundCount > 0) {
                                onRoundCountChange(nextRoundCount);
                            }
                        }}
                    >
                        <Dropdown.Toggle className="difficulty-button" id="rounds-dropdown" disabled={leaderboardMode}>
                            {roundCount}
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                            <Dropdown.Item eventKey="3">3</Dropdown.Item>
                            <Dropdown.Item eventKey="5">5</Dropdown.Item>
                            <Dropdown.Item eventKey="10">10</Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown>
                </div>

                <label className="setting-field">
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
                    <span><strong>Unlabeled map</strong><small>Hide campus labels</small></span>
                    <Form.Check
                        type="switch"
                        id="unlabeled-map-switch"
                        checked={unlabeledMap}
                        onChange={(e) => onUnlabeledMapChange(e.target.checked)}
                        disabled={leaderboardMode}
                    />
                </label>

                <label className={`setting-toggle${leaderboardMode ? " is-disabled" : ""}`} htmlFor="outside-only-switch">
                    <span><strong>Outdoors only</strong><small>Skip indoor locations</small></span>
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
