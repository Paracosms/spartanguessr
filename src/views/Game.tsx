import { useCallback, useEffect, useState } from "react";
import Minimap from "../components/Minimap";
import GuessButton from "../components/GuessButton";
import { useLocation } from "react-router-dom";

type Point = { x: number; y: number };
type ApiDifficulty = "easy" | "medium" | "hard";

type GameRouteState = {
    sessionId?: string;
    roundCount?: number;
    difficulty?: ApiDifficulty;
    unlabeledMap?: boolean;
    outsideOnly?: boolean;
    timerLength?: string;
    seed?: string;
    leaderboardMode?: boolean;
} | null;

const API_BASE_URL = "https://spartanguessr.onrender.com";
const GAME_MINIMAP_HEIGHT_PX = 378;

export default function Game() {
    const [pinPosition, setPinPosition] = useState<Point | null>(null);
    const [roundNumber, setRoundNumber] = useState(1);
    const [roundImageUrl, setRoundImageUrl] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [autoSubmitSignal, setAutoSubmitSignal] = useState(0);
    const location = useLocation();

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
        try {
            setRoundImageUrl(null);
            const params = new URLSearchParams();

            if (sessionId != null) {
                params.set("session_id", String(sessionId));
            } else {
                params.set("difficulty", difficulty);
                params.set("outside_only", outsideOnly ? "true" : "false");
            }

            if (seed) {
                params.set("seed", seed);
            }

            const randomImageRes = await fetch(`${API_BASE_URL}/random-image?${params.toString()}`);
            if (!randomImageRes.ok) {
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
    }, [difficulty, outsideOnly, roundTimerSeconds, seed, sessionId]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void loadRandomImage();
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [loadRandomImage]);

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

    return (
        <>

            {roundImageUrl && (
                <img src={`https://spartanguessr.onrender.com${roundImageUrl}`}
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

            <div className="position-fixed d-flex flex-column bottom-0 end-0 p-3 gap-3">
                    <p className="text-black text-center bg-white rounded shadow border border-5 border-warning" style={{fontSize: "30px", fontWeight: "400"}}>
                        Current Round: {roundNumber}/{maxRounds}
                    </p>

                    <Minimap
                        pinPosition={pinPosition}
                        unlabeled={unlabeledMap}
                        onPinChange={setPinPosition}
                        mapHeightPx={GAME_MINIMAP_HEIGHT_PX}
                        minZoomMode="fit"
                    />

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
        </>
    );
}
