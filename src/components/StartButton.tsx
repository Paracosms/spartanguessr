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

            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const result = await res.json();
            console.log("SUCCESS", result);
        } catch (err) {
            console.error("FAIL", err);
        }
    }

    return (
        <div>
            <SettingsMenu difficulty={formData} onDifficultyChange={handleFormDataChange} />

            <button type="button" onClick={sendToServer}>
                Send to server
            </button>

            <p> JSON sent to server:</p>
            <pre>{JSON.stringify(formData, null, 2)}</pre>
        </div>
    );
}