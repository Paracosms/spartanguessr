import { useState } from "react";
import Minimap from "../components/Minimap";
import GuessButton from "../components/GuessButton";

type Point = { x: number; y: number };

export default function Game() {
    const [pinPosition, setPinPosition] = useState<Point | null>(null);
    const [roundNumber, setRoundNumber] = useState<number | null>(1);

    // TEST VALUES
    const [sessionId] = useState<number | null>(420);
    const [imageId] = useState<number | null>(69);

    // receive image url

    return (
        <>
            <p className="text-black">{roundNumber}</p>

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
                        coordinates={pinPosition}
                        onRoundAdvance={() => setRoundNumber((r) => r + 1)}
                    />
            </div>
        </>
    );
}
