export default function GuessButton() {
    function sendToServer() {
        console.log("i totally sent those coordinates man")
    }

    return (
            <button className="start-game-button" type="button" onClick={sendToServer}>
                Guess
            </button>
    )
}