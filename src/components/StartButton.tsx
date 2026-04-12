import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SettingsMenu from "./SettingsMenu.tsx";
import { preloadGameAssets } from "../utils/preloadGameAssets.tsx";

type DifficultyLabel = "Easy" | "Medium" | "Hard";

type GameFormData = {
    difficulty: 1 | 2 | 3;
    unlabled_map: boolean;
    round_count: number;
    timer_length: string;
    seed: string;
    outside_only: boolean;
};

const API_BASE_URL = "https://spartanguessr.onrender.com";

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

function levelToApiDifficulty(level: 1 | 2 | 3): "easy" | "medium" | "hard" {
    if (level === 1) return "easy";
    if (level === 3) return "hard";
    return "medium";
}

export default function StartButton() {

    // DEFAULT STATE
    const [formData, setFormData] = useState<GameFormData>({
        difficulty: 2, // 1: easy, 2: medium, 3: hard
        round_count: 5,
        timer_length: "30", // "none" "30" "60" "120"
        seed: "",
        outside_only: false,
        unlabled_map: false,
    });
    const navigate = useNavigate();

    function handleDifficultyChange(nextDifficulty: string) {
        const normalized = (nextDifficulty as DifficultyLabel) || "Easy";
        const mappedDifficulty = DIFFICULTY_TO_LEVEL[normalized] ?? 1;
        setFormData((prev) => ({ ...prev, difficulty: mappedDifficulty }));
    }

    function handleUnlabeledMapChange(value: boolean) {
        setFormData((prev) => ({ ...prev, unlabled_map: value }));
    }

    function handleTimerLengthChange(value: string) {
        setFormData((prev) => ({ ...prev, timer_length: value }));
    }

    function handleRoundCountChange(value: number) {
        setFormData((prev) => ({ ...prev, round_count: value }));
    }

    function handleSeedChange(value: string) {
        setFormData((prev) => ({ ...prev, seed: value }));
    }

    function handleOutsideOnlyChange(value: boolean) {
        setFormData((prev) => ({ ...prev, outside_only: value }));
    }

    async function sendToServer() {
        await preloadGameAssets();

        const normalizedSeed =
            formData.seed.trim() || Array.from({ length: 50 }, () => Math.floor(Math.random() * 10)).join("");

        try {
            const res = await fetch(`${API_BASE_URL}/session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: levelToApiDifficulty(formData.difficulty),
                    max_rounds: formData.round_count,
                    outside_enabled: formData.outside_only,
                    seed: normalizedSeed,
                }),
            });

            if (!res.ok) {
                console.error("FAIL", `Server error: ${res.status}`);
                alert("Unable to start a session. Please try again.");
                return;
            }

            const result = (await res.json()) as { session_id: string };

            navigate("/game", {
                state: {
                    sessionId: result.session_id,
                    roundCount: formData.round_count,
                    difficulty: levelToApiDifficulty(formData.difficulty),
                    outsideOnly: formData.outside_only,
                    timerLength: formData.timer_length,
                    seed: normalizedSeed,
                },
            });

            console.log("SUCCESS", result);
        } catch (err) {
            console.error("FAIL", err);
            alert("Unable to start a session. Please try again.");
        }
    }

    return (
        <div className="start-card">
            <p className="start-card-label">Game Settings</p>

            <SettingsMenu
                difficulty={levelToDifficulty(formData.difficulty)}
                onDifficultyChange={handleDifficultyChange}
                unlabeledMap={formData.unlabled_map}
                onUnlabeledMapChange={handleUnlabeledMapChange}
                roundCount={formData.round_count}
                onRoundCountChange={handleRoundCountChange}
                timerLength={formData.timer_length}
                onTimerLengthChange={handleTimerLengthChange}
                seed={formData.seed}
                onSeedChange={handleSeedChange}
                outsideOnly={formData.outside_only}
                onOutsideOnlyChange={handleOutsideOnlyChange}
            />

            <button className="start-game-button" type="button" onClick={sendToServer}>
                Start Game
            </button>

            <pre className="selection-summary">
{`{
difficulty: ${formData.difficulty}
unlabeled_map: ${formData.unlabled_map}
round_count: ${formData.round_count}
timer_length: ${formData.timer_length}
seed: ${formData.seed}
outside_only: ${formData.outside_only}
}`}
            </pre>
        </div>
    );
}
