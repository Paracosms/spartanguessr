
type Point = { x: number; y: number };

type GuessButtonProps = {
    coordinates: Point | null;
};

export default function GuessButton({ coordinates }: GuessButtonProps) {

    async function sendToServer() {
        if (!coordinates) return;

        console.log(coordinates);

        try {
            const res = await fetch("API CALL", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(coordinates),
            });

            if (!res.ok) {
                console.error("FAIL", `Server error: ${res.status}`);
                return;
            }
            const result = await res.json();

            // TODO: handle result before proceeding to next round

            console.log("SUCCESS", result);
        } catch (err) {
            console.error("FAIL", err);
        }
    }

    return (
            <button className="start-game-button" type="button" onClick={sendToServer} disabled={!coordinates}>
                Guess
            </button>
    )
}