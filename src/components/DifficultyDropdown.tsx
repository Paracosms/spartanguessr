import Dropdown from 'react-bootstrap/Dropdown';
import { useSettings } from "./SettingsContext";

function DifficultyDropdown() {
    const { settings, setSettings } = useSettings();


    return (
        <Dropdown>
            <Dropdown.Toggle variant="primary" id="dropdown-basic">
                {settings.difficulty ?? "Select Difficulty"}
            </Dropdown.Toggle>

            <Dropdown.Menu>
                <Dropdown.Item eventKey="Easy" href="#/action-1">Easy</Dropdown.Item>
                <Dropdown.Item eventKey="Medium" href="#/action-2">Medium</Dropdown.Item>
                <Dropdown.Item eventKey="Hard" href="#/action-3">Hard</Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    );
}

export default DifficultyDropdown;