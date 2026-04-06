import Dropdown from "react-bootstrap/Dropdown";
import Form from "react-bootstrap/Form";

type SettingsMenuProps = {
    difficulty: string;
    onDifficultyChange: (difficulty: string) => void;
    labeledMap: boolean;
    onLabeledMapChange: (value: boolean) => void;
    timerLength: string;
    onTimerLengthChange: (value: string) => void;
    seed: string;
    onSeedChange: (value: string) => void;
    outsideOnly: boolean;
    onOutsideOnlyChange: (value: boolean) => void;
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
    labeledMap,
    onLabeledMapChange,
    timerLength,
    onTimerLengthChange,
    seed,
    onSeedChange,
    outsideOnly,
    onOutsideOnlyChange,
}: SettingsMenuProps) {
    return (
        <>
            {/* Dropdowns & inputs */}
            <Dropdown onSelect={(eventKey) => eventKey && onDifficultyChange(eventKey)}>
                <Dropdown.Toggle className="difficulty-button" variant="success" id="difficulty-dropdown">
                    Difficulty: {difficulty}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                    <Dropdown.Item eventKey="Easy">Easy</Dropdown.Item>
                    <Dropdown.Item eventKey="Medium">Medium</Dropdown.Item>
                    <Dropdown.Item eventKey="Hard">Hard</Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>

            <Dropdown onSelect={(eventKey) => eventKey && onTimerLengthChange(eventKey)}>
                <Dropdown.Toggle className="difficulty-button" variant="success" id="timer-dropdown">
                    Timer: {TIMER_DISPLAY[timerLength] ?? timerLength}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                    <Dropdown.Item eventKey="none">None</Dropdown.Item>
                    <Dropdown.Item eventKey="30">30s</Dropdown.Item>
                    <Dropdown.Item eventKey="60">60s</Dropdown.Item>
                    <Dropdown.Item eventKey="120">120s</Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>

            <input
                className="setting-input"
                type="text"
                placeholder="Seed (optional)"
                value={seed}
                onChange={(e) => onSeedChange(e.target.value)}
            />

            {/* Toggles */}
            <div className="setting-toggle">
                <span>Labeled Map</span>
                <Form.Check
                    type="switch"
                    id="labeled-map-switch"
                    checked={labeledMap}
                    onChange={(e) => onLabeledMapChange(e.target.checked)}
                />
            </div>

            <div className="setting-toggle">
                <span>Outside Only</span>
                <Form.Check
                    type="switch"
                    id="outside-only-switch"
                    checked={outsideOnly}
                    onChange={(e) => onOutsideOnlyChange(e.target.checked)}
                />
            </div>
        </>
    );
}
