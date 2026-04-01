import Dropdown from 'react-bootstrap/Dropdown';

// @ts-ignore
function SettingsMenu({ difficulty, onDifficultyChange }) {
    return (
        <Dropdown onSelect={(eventKey) => onDifficultyChange(eventKey)}>
            <Dropdown.Toggle variant="primary" id="dropdown-basic">
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

