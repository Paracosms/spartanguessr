import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SettingsMenu from "./SettingsMenu.tsx";
import { preloadGameAssets } from "../utils/preloadGameAssets.tsx";
import { ApiError, createSession } from "../utils/api.tsx";
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

type LandingPage = "settings" | "credits" | "leaderboard";

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

    const [activePage, setActivePage] = useState<LandingPage>("settings");
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
                expectedRound: result.current_round,
                roundCount: effectiveSettings.round_count,
                difficulty: levelToApiDifficulty(effectiveSettings.difficulty),
                unlabeledMap: effectiveSettings.unlabeled_map,
                outsideOnly: effectiveSettings.outside_only,
                timerLength: effectiveSettings.timer_length,
                seed: effectiveSettings.leaderboard_mode ? undefined : normalizedSeed,
                leaderboardMode: effectiveSettings.leaderboard_mode,
            };

            navigate("/game", { state: gameRouteState });
        } catch (err) {
            console.error("FAIL", err);
            alert(err instanceof ApiError ? err.message : "Unable to start a session. Please try again.");
        }
    }

    return (
        <div className="landing-card-shell">
            <div className="landing-tabs" role="tablist" aria-label="Landing pages">
                <button
                    className={`landing-tab${activePage === "settings" ? " is-active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activePage === "settings"}
                    aria-controls="landing-panel"
                    id="landing-tab-settings"
                    onClick={() => setActivePage("settings")}
                >
                    Game Settings
                </button>
                <button
                    className={`landing-tab${activePage === "credits" ? " is-active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activePage === "credits"}
                    aria-controls="landing-panel"
                    id="landing-tab-credits"
                    onClick={() => setActivePage("credits")}
                >
                    Credits
                </button>
                <button
                    className={`landing-tab${activePage === "leaderboard" ? " is-active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activePage === "leaderboard"}
                    aria-controls="landing-panel"
                    id="landing-tab-leaderboard"
                    onClick={() => setActivePage("leaderboard")}
                >
                    Leaderboard
                </button>
            </div>

            {activePage === "settings" ? (
                <div
                    className="start-card"
                    id="landing-panel"
                    role="tabpanel"
                    aria-labelledby="landing-tab-settings"
                >
                    <div className="mode-picker" aria-label="Game mode">
                        <button
                            className={`mode-option${!formData.leaderboard_mode ? " is-active" : ""}`}
                            type="button"
                            aria-pressed={!formData.leaderboard_mode}
                            onClick={() => handleLeaderboardModeChange(false)}
                        >
                            <span className="mode-name">Classic</span>
                            <span className="mode-description">Customize gameplay</span>
                        </button>
                        <button
                            className={`mode-option${formData.leaderboard_mode ? " is-active" : ""}`}
                            type="button"
                            aria-pressed={formData.leaderboard_mode}
                            onClick={() => handleLeaderboardModeChange(true)}
                        >
                            <span className="mode-name">Ranked</span>
                            <span className="mode-description">Fixed ruleset with leaderboard</span>
                        </button>
                    </div>

                    <div className="game-summary" aria-label="Selected game settings">
                        <span><small>Difficulty</small>{levelToDifficulty(formData.difficulty)}</span>
                        <span><small>Rounds</small>{formData.round_count}</span>
                        <span><small>Timer</small>{formData.timer_length === "none" ? "Off" : `${formData.timer_length}s`}</span>
                    </div>

                    <details className="settings-disclosure" open>
                        <summary>
                            <span>Customize game</span>
                            <span className="summary-chevron" aria-hidden="true">⌄</span>
                        </summary>
                        <div className="settings-panel">
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
                            />
                        </div>
                    </details>

                    <button className="start-game-button" type="button" onClick={() => void sendToServer()}>
                        <span>Start Game</span>
                        <span aria-hidden="true">→</span>
                    </button>
                </div>
            ) : (
                <div
                    className="landing-placeholder"
                    id="landing-panel"
                    role="tabpanel"
                    aria-labelledby={`landing-tab-${activePage}`}
                    data-page={activePage}
                />
            )}
        </div>
    );
}
