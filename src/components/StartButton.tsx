import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SettingsMenu from "./SettingsMenu.tsx";
import { preloadGameAssets } from "../utils/preloadGameAssets.tsx";

type DifficultyLabel = "Easy" | "Medium" | "Hard";

type GameFormData = {
    difficulty: 1 | 2 | 3;
    labeled_map: string;
    timer_length: string;
    seed: string;
    outside_only: string;
};

const DIFFICULTY_TO_LEVEL: Record<DifficultyLabel, 1 | 2 | 3> = {
    Easy: 1,
    Medium: 2,
    Hard: 3,
};

function levelToDifficulty(level: 1 | 2 | 3): DifficultyLabel {
    if (level === 2) return "Medium";
    if (level === 3) return "Hard";
    return "Easy";
}

export default function StartButton() {

    const [formData, setFormData] = useState<GameFormData>({
        difficulty: 1,
        labeled_map: "",
        timer_length: "",
        seed: "",
        outside_only: "",
    });
    const navigate = useNavigate();

    // Only difficulty works for now the rest of the fields are placeholders
    function handleFormDataChange(nextDifficulty: string) {
        const normalized = (nextDifficulty as DifficultyLabel) || "Easy";
        const mappedDifficulty = DIFFICULTY_TO_LEVEL[normalized] ?? 1;

        setFormData((prev) => ({
            ...prev,
            difficulty: mappedDifficulty,
        }));
    }

    async function sendToServer() {
        await preloadGameAssets();
        navigate("/game")

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

            // TODO: handle result before proceeding to /game
            //navigate("/game")

            console.log("SUCCESS", result);
        } catch (err) {


            console.error("FAIL", err);


        }


    }

    return (
        <div className="start-card">
            <p className="start-card-label">Game Settings</p>

            <SettingsMenu
                difficulty={levelToDifficulty(formData.difficulty)}
                onDifficultyChange={handleFormDataChange}
            />

            <button className="start-game-button" type="button" onClick={sendToServer}>
                Start Game
            </button>

            <pre className="selection-summary">
{`{
difficulty: ${formData.difficulty}
labeled_map: ${formData.labeled_map}
timer_length: ${formData.timer_length}
seed: ${formData.seed}
outside_only: ${formData.outside_only}
}`}
            </pre>
        </div>
    );
}