import Dropdown from "react-bootstrap/Dropdown";

type SettingsMenuProps = {
    difficulty: string;
    onDifficultyChange: (difficulty: string) => void;
};

function SettingsMenu({ difficulty, onDifficultyChange }: SettingsMenuProps) {
    return (
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
    );
}

export default SettingsMenu;

