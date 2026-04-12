import { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

type GuessButtonProps = {
    session_id: number | null;
    image_id: number | null;
    round_number: number | null;
    max_rounds: number;
    coordinates: Point | null;
    onRoundAdvance: () => void;
    onRequestNextImage: () => Promise<void>;
    onGameComplete: () => void;
    seed: string;
    autoSubmitSignal?: number;
    fallbackCoordinates?: Point | null;
};

export default function GuessButton({
    session_id,
    image_id,
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
        image_id != null &&
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
            session_id: 420,
            image_id: 69,
            round_number: 67,
            guess_latitude: coordinates?.x,
            guess_longitude: coordinates?.y,
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
                console.error("FAIL", `Server error: ${res.status}`);
                return;
            }
            const result = await res.json();

            // TODO: handle result before proceeding to next round

            console.log("SUCCESS", result);

            if (round_number >= max_rounds) {
                onGameComplete();
                return;
            }

            await onRequestNextImage();
            onRoundAdvance();
        } catch (err) {
            console.error("FAIL", err);
        } finally {
            setIsSubmitting(false);
        }
    }, [coordinates, hasSessionData, image_id, isSubmitting, onGameComplete, onRequestNextImage, onRoundAdvance, round_number, seed, session_id, max_rounds]);

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



