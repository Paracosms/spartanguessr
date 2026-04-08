import { useState } from "react";
import Minimap from "../components/Minimap";
//import GuessButton from "../components/GuessButton";

type Point = { x: number; y: number };

export default function Game() {
    const [pinPosition, setPinPosition] = useState<Point | null>(null);

    // TEST VALUES
    //const [sessionId] = useState<number | null>(420);
    //const [imageId] = useState<number | null>(69);
    //const [roundNumber] = useState<number | null>(67);

    return (
        <>
            <div className="position-fixed align-content-center p-3 gap-3">
                    <Minimap pinPosition={pinPosition} onPinChange={setPinPosition} />
            </div>
        </>
    );
}