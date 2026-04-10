
type Point = { x: number; y: number };

type GuessButtonProps = {
    session_id: number | null;
    image_id: number | null;
    round_number: number | null;
    max_rounds: number;
    coordinates: Point | null;
    onRoundAdvance: () => void;
    onGameComplete: () => void;
};

export default function GuessButton({
    session_id,
    image_id,
    round_number,
    max_rounds,
    coordinates,
    onRoundAdvance,
    onGameComplete,
}: GuessButtonProps) {
    const valid_session =
        session_id != null &&
        image_id != null &&
        round_number != null &&
        coordinates != null;

    async function sendToServer() {
        //if (!valid_session || round_number == null) return;

        const guess_packet = {
            session_id: 420,
            image_id: 69,
            round_number: 67,
            guess_latitude: coordinates?.x,
            guess_longitude: coordinates?.y,
        };

        console.log(guess_packet);

        try {
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

            onRoundAdvance();
        } catch (err) {
            console.error("FAIL", err);
        }
    }

    //disabled={!valid_session}
    return (
        <button className="start-game-button" type="button" onClick={sendToServer} >
            Guess
        </button>
    )
}
