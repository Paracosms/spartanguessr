import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type Point = { x: number; y: number };
type ApiDifficulty = "easy" | "medium" | "hard";

type GameRouteState = {
    sessionId?: string;
    roundCount?: number;
    difficulty?: ApiDifficulty;
    outsideOnly?: boolean;
    timerLength?: string;
    seed?: string;
    leaderboardMode?: boolean;
};

type GuessButtonProps = {
    session_id: string | null;
    image_url: string | null;
    round_number: number | null;
    max_rounds: number;
    coordinates: Point | null;
    gameState: GameRouteState;
    onGameComplete?: (finalScore: number) => void;
    seed: string;
    autoSubmitSignal?: number;
};

export default function GuessButton({
    session_id,
    image_url,
    round_number,
    max_rounds,
    coordinates,
    gameState,
    seed,
    autoSubmitSignal = 0,
}: GuessButtonProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const lastAutoSubmitSignal = useRef(0);
    const navigate = useNavigate();

    const hasSessionData =
        session_id != null &&
        image_url != null &&
        round_number != null;

    const canManuallySubmit = hasSessionData && coordinates != null;

    const sendToServer = useCallback(async (overrideCoordinates?: Point) => {
        if (!hasSessionData || round_number == null || isSubmitting) {
            return;
        }

        const coordinatesToSubmit = overrideCoordinates ?? coordinates;
        if (!coordinatesToSubmit) {
            return;
        }

        const guess_packet = {
            session_id,
            image_url,
            round_number,
            guess_latitude: coordinatesToSubmit.x,
            guess_longitude: coordinatesToSubmit.y,
            seed,
        };

        console.log(guess_packet);

        try {
            setIsSubmitting(true);
            const res = await fetch("https://spartanguessr.onrender.com/guess", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(guess_packet),
            });

            if (!res.ok) {
                const errorResult = await res.json();
                alert(`Error: ${errorResult.error || 'Unknown error'}`);
                console.error("FAIL", `Server error: ${res.status}`, errorResult);
                return;
            }
            const result = await res.json() as {
                score: number;
                total_score: number;
                actual_latitude: number;
                actual_longitude: number;
                game_complete?: boolean;
            };

            console.log("SUCCESS", result);

            const gameComplete = result.game_complete === true || round_number >= max_rounds;

            navigate("/score", {
                state: {
                    guess_pos: coordinatesToSubmit,
                    actual_pos: { x: result.actual_latitude, y: result.actual_longitude },
                    image_url,
                    round_score: result.score,
                    round_number,
                    gameState,
                    is_game_complete: gameComplete,
                    resultsState: gameComplete
                        ? {
                            totalScore: result.total_score,
                            sessionId: gameState.sessionId,
                            leaderboardMode: gameState.leaderboardMode,
                        }
                        : undefined,
                },
            });
        } catch (err) {
            console.error("FAIL", err);
        } finally {
            setIsSubmitting(false);
        }
    }, [coordinates, gameState, hasSessionData, image_url, isSubmitting, max_rounds, navigate, round_number, seed, session_id]);

    useEffect(() => {
        if (autoSubmitSignal <= lastAutoSubmitSignal.current) {
            return;
        }

        lastAutoSubmitSignal.current = autoSubmitSignal;
        const timeoutCoordinates = coordinates ?? { x: 99999, y: 99999 };
        void sendToServer(timeoutCoordinates);
    }, [autoSubmitSignal, coordinates, sendToServer]);

    return (
        <button className="start-game-button" type="button" onClick={() => void sendToServer()} disabled={!canManuallySubmit || isSubmitting}>
            Guess
        </button>
    )
}
