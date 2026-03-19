import './App.css';
import StartButton from "./components/StartButton.tsx";
import Game from "./views/Game.tsx"
import {Routes, Route} from "react-router-dom";

function LandingPage() {
    return (
        <main className="landing-page">
            <section>
                <h1 className="title">Spartanguessr</h1>
                <p className="subtitle">
                    How well do you know SJSU?
                </p>
                <StartButton />
            </section>
        </main>
    );
}

function App() {

  return (
      <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/game" element={<Game />} />
      </Routes>
  );
}

export default App
