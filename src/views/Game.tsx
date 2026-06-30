import { useCallback, useEffect, useState } from "react";
import Minimap from "../components/Minimap";
import GuessButton from "../components/GuessButton";
import { useLocation, useNavigate } from "react-router-dom";
import type { ApiDifficulty, GameRouteState, Point } from "../utils/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const GAME_MINIMAP_HEIGHT_MIN_PX = 378; // minimum height, keeps it usable on small viewports
const GAME_MINIMAP_HEIGHT_VH = 0.60; // fraction of viewport height, scales up on larger monitors
const GAME_MINIMAP_INITIAL_SCALE = 0.35; // starting zoom level for the minimap
const GAME_MINIMAP_INITIAL_OFFSET = {x: -114, y: -92}; // aj: guess and checked minimap

// scales minimap with viewport, never below minimum
function computeMinimapHeight() {
    return Math.max(GAME_MINIMAP_HEIGHT_MIN_PX, Math.round(window.innerHeight * GAME_MINIMAP_HEIGHT_VH));
}

export default function Game() {
    const [pinPosition, setPinPosition] = useState<Point | null>(null);
    const [roundNumber, setRoundNumber] = useState(1);
    const [roundImageUrl, setRoundImageUrl] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [autoSubmitSignal, setAutoSubmitSignal] = useState(0);
    const [minimapHovered, setMinimapHovered] = useState(false); // shrink minimap when not hovered
    const [minimapHeightPx, setMinimapHeightPx] = useState(computeMinimapHeight);
    const location = useLocation();
    const navigate = useNavigate();

    const gameState = location.state as GameRouteState;
    const requestedRoundCount = gameState?.roundCount;
    const sessionId = gameState?.sessionId ?? null;
    const maxRounds =
        typeof requestedRoundCount === "number" && requestedRoundCount > 0
            ? requestedRoundCount
            : 5;

    const difficulty: ApiDifficulty = gameState?.difficulty ?? "medium";
    const unlabeledMap = gameState?.unlabeledMap ?? false;
    const outsideOnly = gameState?.outsideOnly ?? false;
    const timerLength = gameState?.timerLength ?? "none";
    const seed = (gameState?.seed ?? "").trim();
    const leaderboardMode = gameState?.leaderboardMode ?? false;
    const timerSeconds = timerLength === "none" ? null : Number.parseInt(timerLength, 10);
    const roundTimerSeconds = Number.isFinite(timerSeconds) && timerSeconds != null && timerSeconds > 0 ? timerSeconds : null;
    const gameNavigationState: NonNullable<GameRouteState> = {
        sessionId: sessionId ?? undefined,
        roundCount: maxRounds,
        difficulty,
        outsideOnly,
        unlabeledMap,
        timerLength,
        seed,
        leaderboardMode,
    };

    function formatTimer(totalSeconds: number | null) {
        if (totalSeconds == null) {
            return "Off";
        }

        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    // receive image url
    const loadRandomImage = useCallback(async () => {
        if (!sessionId) {
            navigate("/", { replace: true });
            return;
        }

        try {
            setRoundImageUrl(null);
            const params = new URLSearchParams();
            params.set("session_id", sessionId);

            if (seed) {
                params.set("seed", seed);
            }

            const randomImageRes = await fetch(`${API_BASE_URL}/random-image?${params.toString()}`);
            if (!randomImageRes.ok) {
                if (randomImageRes.status === 404) {
                    navigate("/", { replace: true });
                    return;
                }
                console.error("FAIL", `Unable to get random image: ${randomImageRes.status}`);
                return;
            }

            const randomImage = (await randomImageRes.json()) as {
                completed?: boolean;
                difficulty: string;
                location: string;
                image: string;
                image_url: string;
                round_number?: number;
            };

            if (randomImage.completed) {
                return;
            }

            setRoundImageUrl(randomImage.image_url);
            if (typeof randomImage.round_number === "number") {
                setRoundNumber(randomImage.round_number);
            }
            setTimeRemaining(roundTimerSeconds);
        } catch (err) {
            console.error("FAIL", err);
        }
    }, [navigate, roundTimerSeconds, seed, sessionId]);

    useEffect(() => {
        if (!sessionId) {
            navigate("/", { replace: true });
            return;
        }

        const timeoutId = window.setTimeout(() => {
            void loadRandomImage();
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [loadRandomImage, navigate, sessionId]);

    useEffect(() => {
        if (roundTimerSeconds == null || !roundImageUrl) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setTimeRemaining((previousTime) => {
                if (previousTime == null) {
                    return previousTime;
                }

                if (previousTime <= 1) {
                    window.clearInterval(intervalId);
                    setAutoSubmitSignal((signal) => signal + 1);
                    return 0;
                }

                return previousTime - 1;
            });
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [roundImageUrl, roundNumber, roundTimerSeconds]);

    // update minimap height on resize
    useEffect(() => {
        function handleResize() {
            setMinimapHeightPx(computeMinimapHeight());
        }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <>

            {roundImageUrl && (    
                <img src={`${API_BASE_URL}${roundImageUrl}`}
                    draggable={false}
                    style={{
                        width: "100vw",
                        height: "100vh",
                        objectFit: "contain",
                        background: "#000000", // "#1176B9" // blue background to match sjsu logo?
                        // adds outline around the browser window
                        // border: "6px solid #FFC108",
                        // boxSizing: "border-box",
                    }}
                />
            )}

            <div className="position-absolute top-0 start-50 translate-middle-x p-3" >
                <p className="text-black text-center bg-white rounded shadow border border-5 border-warning px-3" style={{fontSize: "30px", fontWeight: "400"}}>
                    Timer: {formatTimer(timeRemaining)} 
                </p>
            </div>

            <div className="position-absolute top-0 end-0 p-3">
                <p className="text-black text-center bg-white rounded shadow border border-5 border-warning px-3" style={{fontSize: "30px", fontWeight: "400"}}>
                    Current Round: {roundNumber}/{maxRounds}
                </p>
            </div>

            <div className="position-fixed d-flex flex-column bottom-0 end-0 p-3 gap-3" style={{alignItems: "flex-end"}}>
                    {/* shrinks to 70% when idle, expands on hover */}
                    <div onMouseEnter={() => setMinimapHovered(true)} onMouseLeave={() => setMinimapHovered(false)}
                         style={{transform: minimapHovered ? "scale(1.2)" : "scale(0.7)", transformOrigin: "bottom right", transition: "transform 0.2s ease"}}>
                        <Minimap
                            pinPosition={pinPosition}
                            unlabeled={unlabeledMap}
                            onPinChange={setPinPosition}
                            mapHeightPx={minimapHeightPx}
                            minZoomMode="fit"
                            initialScale={GAME_MINIMAP_INITIAL_SCALE}
                            initialOffset={GAME_MINIMAP_INITIAL_OFFSET}
                            cssScale={minimapHovered ? 1.2 : 0.7}
                        />
                    </div>

                    {/* match guess button to minimap size */}
                    <div style={{width: `${Math.round(minimapHeightPx * (1428 / 1503) * 0.7)}px`}}>
                        <GuessButton
                            session_id={sessionId}
                            image_url={roundImageUrl}
                            round_number={roundNumber}
                            max_rounds={maxRounds}
                            coordinates={pinPosition}
                            gameState={gameNavigationState}
                            onGameComplete={() => {}}
                            seed={seed}
                            autoSubmitSignal={autoSubmitSignal}
                        />
                    </div>
            </div>
        </>
    );
}
