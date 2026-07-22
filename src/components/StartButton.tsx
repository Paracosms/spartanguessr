import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SettingsMenu from "./SettingsMenu.tsx";
import { preloadGameAssets } from "../utils/preloadGameAssets.tsx";
import { ApiError, createSession } from "../utils/api";
import type { ApiDifficulty, GameRouteState } from "../utils/types";

type DifficultyLabel = "Easy" | "Medium" | "Hard";

type GameFormData = {
    difficulty: 1 | 2 | 3;
    unlabeled_map: boolean;
    round_count: number;
    timer_length: string;
    seed: string;
    outside_only: boolean;
    leaderboard_mode: boolean;
};

const DIFFICULTY_TO_LEVEL: Record<DifficultyLabel, 1 | 2 | 3> = {
    Easy: 1,
    Medium: 2,
    Hard: 3,
};

const LEADERBOARD_PRESET = {
    difficulty: 3 as const,
    unlabeled_map: false,
    round_count: 5,
    timer_length: "30",
    outside_only: false,
};

function generateRandomSeed() {
    return Array.from({ length: 50 }, () => Math.floor(Math.random() * 10)).join("");
}

function levelToDifficulty(level: 1 | 2 | 3): DifficultyLabel {
    if (level === 2) return "Medium";
    if (level === 3) return "Hard";
    return "Easy";
}

function levelToApiDifficulty(level: 1 | 2 | 3): ApiDifficulty {
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
        unlabeled_map: false,
        leaderboard_mode: false,
    });
    const navigate = useNavigate();

    function handleDifficultyChange(nextDifficulty: string) {
        const normalized = (nextDifficulty as DifficultyLabel) || "Easy";
        const mappedDifficulty = DIFFICULTY_TO_LEVEL[normalized] ?? 1;
        setFormData((prev) => (prev.leaderboard_mode ? prev : { ...prev, difficulty: mappedDifficulty }));
    }

    function handleUnlabeledMapChange(value: boolean) {
        setFormData((prev) => (prev.leaderboard_mode ? prev : { ...prev, unlabeled_map: value }));
    }

    function handleTimerLengthChange(value: string) {
        setFormData((prev) => (prev.leaderboard_mode ? prev : { ...prev, timer_length: value }));
    }

    function handleRoundCountChange(value: number) {
        setFormData((prev) => (prev.leaderboard_mode ? prev : { ...prev, round_count: value }));
    }

    function handleSeedChange(value: string) {
        setFormData((prev) => (prev.leaderboard_mode ? prev : { ...prev, seed: value }));
    }

    function handleOutsideOnlyChange(value: boolean) {
        setFormData((prev) => (prev.leaderboard_mode ? prev : { ...prev, outside_only: value }));
    }

    function handleLeaderboardModeChange(value: boolean) {
        setFormData((prev) => {
            if (!value) {
                return { ...prev, leaderboard_mode: false };
            }

            return {
                ...prev,
                ...LEADERBOARD_PRESET,
                seed: "",
                leaderboard_mode: true,
            };
        });
    }

    // leaving this here in case we ever need it again
    /* SELECTION SUMMARY:
        {`{
            difficulty: ${formData.difficulty}
            unlabeled_map: ${formData.unlabeled_map}
            round_count: ${formData.round_count}
            timer_length: ${formData.timer_length}
            seed: ${formData.seed}
            outside_only: ${formData.outside_only}
            leaderboard_mode: ${formData.leaderboard_mode}
        }`}
     */

    async function sendToServer() {
        await preloadGameAssets();

        const effectiveSettings: GameFormData = formData.leaderboard_mode
            ? {
                ...formData,
                ...LEADERBOARD_PRESET,
                seed: "",
                leaderboard_mode: true,
            }
            : formData;

        const normalizedSeed = effectiveSettings.seed.trim() || generateRandomSeed();

        try {
            const result = await createSession({
                difficulty: levelToApiDifficulty(effectiveSettings.difficulty),
                max_rounds: effectiveSettings.round_count,
                outside_only: effectiveSettings.outside_only,
                ...(!effectiveSettings.leaderboard_mode && { seed: normalizedSeed }),
                leaderboard_mode: effectiveSettings.leaderboard_mode,
            });

            const gameRouteState: NonNullable<GameRouteState> = {
                sessionId: result.session_id,
                roundCount: effectiveSettings.round_count,
                difficulty: levelToApiDifficulty(effectiveSettings.difficulty),
                unlabeledMap: effectiveSettings.unlabeled_map,
                outsideOnly: effectiveSettings.outside_only,
                timerLength: effectiveSettings.timer_length,
                seed: effectiveSettings.leaderboard_mode ? undefined : normalizedSeed,
                leaderboardMode: effectiveSettings.leaderboard_mode,
            };

            navigate("/game", { state: gameRouteState });

            console.log("SUCCESS", result);
        } catch (err) {
            console.error("FAIL", err);
            alert(err instanceof ApiError ? err.message : "Unable to start a session. Please try again.");
        }
    }

    return (
        <div className="start-card">
            <p className="start-card-label">Game Settings</p>

            <SettingsMenu
                difficulty={levelToDifficulty(formData.difficulty)}
                onDifficultyChange={handleDifficultyChange}
                unlabeledMap={formData.unlabeled_map}
                onUnlabeledMapChange={handleUnlabeledMapChange}
                roundCount={formData.round_count}
                onRoundCountChange={handleRoundCountChange}
                timerLength={formData.timer_length}
                onTimerLengthChange={handleTimerLengthChange}
                seed={formData.seed}
                onSeedChange={handleSeedChange}
                outsideOnly={formData.outside_only}
                onOutsideOnlyChange={handleOutsideOnlyChange}
                leaderboardMode={formData.leaderboard_mode}
                onLeaderboardModeChange={handleLeaderboardModeChange}
            />

            <button className="start-game-button" type="button" onClick={sendToServer}>
                Start Game
            </button>

        </div>
    );
}
