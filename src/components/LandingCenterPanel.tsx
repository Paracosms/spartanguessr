import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { LandingLeaderboardPanel } from "./LandingSidePanels.tsx";
import SettingsMenu from "./SettingsMenu.tsx";
import { preloadGameAssets, preloadNextRoundImage } from "../utils/preloadGameAssets.tsx";
import { ApiError, createSession, startRound } from "../utils/api.tsx";
import type { ApiDifficulty, GameRouteState } from "../utils/types";
import { recordGameStarted } from "../utils/stats.ts";
import StatsPanel from "./StatsPanel.tsx";
import AboutPanel from "./AboutPanel.tsx";

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

type LandingPage = "settings" | "stats" | "about" | "leaderboard";

const COMPACT_LANDING_QUERY = "(max-width: 899px), (max-height: 560px), (orientation: portrait), (pointer: coarse)";

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

export default function LandingCenterPanel() {

    const [activePage, setActivePage] = useState<LandingPage>("settings");
    const [showLeaderboardTab, setShowLeaderboardTab] = useState(() =>
        window.matchMedia(COMPACT_LANDING_QUERY).matches
    );
    const [playPanelHeight, setPlayPanelHeight] = useState<number | null>(null);
    const playPanelRef = useRef<HTMLDivElement | null>(null);
    const [isStarting, setIsStarting] = useState(false);
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

    useEffect(() => {
        const mediaQuery = window.matchMedia(COMPACT_LANDING_QUERY);
        const handleChange = (event: MediaQueryListEvent) => {
            setShowLeaderboardTab(event.matches);
            setActivePage((currentPage) => {
                if (event.matches ? currentPage === "stats" : currentPage === "leaderboard") {
                    return "settings";
                }
                return currentPage;
            });
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    useEffect(() => {
        if (activePage !== "settings") return;

        const playPanel = playPanelRef.current;
        if (!playPanel) return;

        const updatePlayPanelHeight = () => {
            setPlayPanelHeight(playPanel.getBoundingClientRect().height);
        };

        updatePlayPanelHeight();
        const resizeObserver = new ResizeObserver(updatePlayPanelHeight);
        resizeObserver.observe(playPanel);

        return () => resizeObserver.disconnect();
    }, [activePage]);

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

    async function sendToServer() {
        if (isStarting) return;

        setIsStarting(true);

        try {
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
            const parsedTimerSeconds = effectiveSettings.timer_length === "none"
                ? null
                : Number.parseInt(effectiveSettings.timer_length, 10);

            const result = await createSession({
                difficulty: levelToApiDifficulty(effectiveSettings.difficulty),
                max_rounds: effectiveSettings.round_count,
                outside_only: effectiveSettings.outside_only,
                ...(!effectiveSettings.leaderboard_mode && { seed: normalizedSeed }),
                leaderboard_mode: effectiveSettings.leaderboard_mode,
                timer_seconds: parsedTimerSeconds,
            });
            recordGameStarted(result.session_id);
            await preloadNextRoundImage(result.session_id, result.current_round);
            await startRound(result.session_id, result.current_round);

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
        } finally {
            setIsStarting(false);
        }
    }

    return (
        <div
            className="landing-card-shell"
            style={playPanelHeight === null
                ? undefined
                : ({ "--landing-play-panel-height": `${playPanelHeight}px` } as CSSProperties)}
        >
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
                    Play
                </button>
                <button
                    className={`landing-tab${activePage === "stats" ? " is-active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activePage === "stats"}
                    aria-controls="landing-panel"
                    id="landing-tab-stats"
                    onClick={() => setActivePage("stats")}
                >
                    Stats
                </button>
                {showLeaderboardTab && (
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
                )}
                <button
                    className={`landing-tab${activePage === "about" ? " is-active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activePage === "about"}
                    aria-controls="landing-panel"
                    id="landing-tab-about"
                    onClick={() => setActivePage("about")}
                >
                    About
                </button>
            </div>

            {activePage === "settings" ? (
                <div
                    className="start-card"
                    ref={playPanelRef}
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

                    <button
                        className="start-game-button"
                        type="button"
                        onClick={() => void sendToServer()}
                        disabled={isStarting}
                    >
                        <span>{isStarting ? "Starting…" : "Start game"}</span>
                        <span aria-hidden="true">→</span>
                    </button>
                </div>
            ) : activePage === "stats" ? (
                <StatsPanel />
            ) : activePage === "leaderboard" ? (
                <LandingLeaderboardPanel embedded />
            ) : (
                <AboutPanel />
            )}
        </div>
    );
}
