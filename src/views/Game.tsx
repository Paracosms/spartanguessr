import Minimap from "../components/Minimap.tsx";

export default function Game() {
    return (
        <>
            <img src="https://ngocng2910.github.io/images/hard/outside/IMG_8146.JPG" style={{width: "100vw", height: "100vh"}} />
            <div className="position-fixed bottom-0 end-0 p-3">
                    <Minimap />
            </div>
        </>
    );
}