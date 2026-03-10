import './App.css';
import StartButton from "./components/StartButton.tsx";

function App() {

  return (
    <>
        <div className="d-flex flex-column align-items-center">
            <h1>Spartanguessr</h1>

            <div className="d-flex flex-column align-items-center gap-2">
                <StartButton/>
            </div>
        </div>
    </>
  )
}

export default App
