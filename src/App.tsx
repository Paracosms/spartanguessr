import './App.css';
import StartButton from "./components/StartButton.tsx";
import DifficultyDropdown from "./components/DifficultyDropdown.tsx";

function App() {

  return (
    <>
        <div className="d-flex flex-column align-items-center">
            <h1>Spartanguessr</h1>

            <div className="d-flex flex-column align-items-center gap-2">

                    <DifficultyDropdown />
                    <StartButton />

            </div>
        </div>
    </>
  )
}

export default App
