import { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

type GuessButtonProps = {
    session_id: string | null;
    image_url: string | null;
    round_number: number | null;
    max_rounds: number;
    coordinates: Point | null;
    onRoundAdvance: () => void;
    onRequestNextImage: () => Promise<void>;
    onGameComplete: (finalScore: number) => void;
    seed: string;
    autoSubmitSignal?: number;
    fallbackCoordinates?: Point | null;
};

export default function GuessButton({
    session_id,
    image_url,
    round_number,
    max_rounds,
    coordinates,
    onRoundAdvance,
    onRequestNextImage,
    onGameComplete,
    seed,
    autoSubmitSignal = 0,
    fallbackCoordinates = null,
}: GuessButtonProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const lastAutoSubmitSignal = useRef(0);

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
            const result = await res.json();
            alert(`Round ${round_number} score: ${result.score}`);

            console.log("SUCCESS", result);

            if (round_number >= max_rounds) {
                onGameComplete(result.total_score);
                return;
            }

            await onRequestNextImage();
            onRoundAdvance();
        } catch (err) {
            console.error("FAIL", err);
        } finally {
            setIsSubmitting(false);
        }
    }, [coordinates, hasSessionData, image_url, isSubmitting, onGameComplete, onRequestNextImage, onRoundAdvance, round_number, seed, session_id, max_rounds]);

    useEffect(() => {
        if (autoSubmitSignal <= lastAutoSubmitSignal.current) {
            return;
        }

        lastAutoSubmitSignal.current = autoSubmitSignal;
        const timeoutCoordinates = fallbackCoordinates ?? { x: 99999, y: 99999 };
        void sendToServer(timeoutCoordinates);
    }, [autoSubmitSignal, fallbackCoordinates, sendToServer]);

    return (
        <button className="start-game-button" type="button" onClick={() => void sendToServer()} disabled={!canManuallySubmit || isSubmitting}>
            Guess
        </button>
    )
}
