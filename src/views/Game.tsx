import Minimap from "../components/Minimap.tsx";
import GuessButton from "../components/GuessButton.tsx";

export default function Game() {
    return (
        <>
            <img src="https://ngocng2910.github.io/images/hard/outside/IMG_8146.JPG"
                 draggable={false}
                 style={{
                    width: "100vw",
                    height: "100vh",
                }}
            />

            <div className="position-fixed d-flex flex-column bottom-0 end-0 p-3 gap-3">
                    <Minimap />
                    <GuessButton />
            </div>
        </>
    );
}