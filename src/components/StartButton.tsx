import {useSettings} from "./SettingsContext";

const StartButton = () => {
    const {settings} = useSettings();

    return (
        <button onClick={() => console.log("starting:", settings)}>
            Start Game
        </button>
    )
}

export default StartButton;