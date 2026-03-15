import { useState, type SetStateAction} from "react";
import SettingsMenu from "./SettingsMenu.tsx";

export default function StartButton() {

    const [formData, setFormData] = useState("Easy")

    // below is the ideal implementation, right now i just put in a basic one that i will refactor later

    //const [formData, setFormData] = useState({
    //    difficulty: ""
    //});

    // Called by child whenever the form changes (or on submit)
    function handleFormDataChange(nextData: SetStateAction<string>) {
        setFormData(nextData);
    }

    async function sendToServer() {
        try {
            const res = await fetch("API CALL", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                console.error("FAIL", `Server error: ${res.status}`);
                return;
            }

            const result = await res.json();
            console.log("SUCCESS", result);
        } catch (err) {
            console.error("FAIL", err);
        }
    }

    return (
        <div className="start-card">
            <p className="start-card-label">Game Settings</p>

            <SettingsMenu difficulty={formData} onDifficultyChange={handleFormDataChange} />

            <button className="start-game-button" type="button" onClick={sendToServer}>
                Start Game
            </button>

            <p className="selection-summary">
                Selected difficulty: {formData}
            </p>
        </div>
    );
}