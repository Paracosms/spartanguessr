import { useState } from "react";
import Minimap from "../components/Minimap";
import GuessButton from "../components/GuessButton";
import { useLocation, useNavigate } from "react-router-dom";

type Point = { x: number; y: number };

export default function Game() {
    const [pinPosition, setPinPosition] = useState<Point | null>(null);
    const [roundNumber, setRoundNumber] = useState(1);
    const location = useLocation();
    const navigate = useNavigate();

    const requestedRoundCount = (location.state as { roundCount?: number } | null)?.roundCount;
    const maxRounds =
        typeof requestedRoundCount === "number" && requestedRoundCount > 0
            ? requestedRoundCount
            : 5;

    // TEST VALUES
    const [sessionId] = useState<number | null>(420);
    const [imageId] = useState<number | null>(69);

    // receive image url

    return (
        <>
            <p className="text-black">
                {roundNumber}/{maxRounds}
            </p>

            <img src="https://ngocng2910.github.io/images/hard/outside/IMG_8146.JPG"
                 draggable={false}
                 style={{
                    width: "100vw",
                    height: "100vh",
                }}
            />
            <div className="position-fixed d-flex flex-column bottom-0 end-0 p-3 gap-3">
                    <Minimap pinPosition={pinPosition} onPinChange={setPinPosition} />
                    <GuessButton
                        session_id={sessionId}
                        image_id={imageId}
                        round_number={roundNumber}
                        max_rounds={maxRounds}
                        coordinates={pinPosition}
                        onRoundAdvance={() => setRoundNumber((r) => r + 1)}
                        onGameComplete={() => navigate("/results")}
                    />
            </div>
        </>
    );
}
