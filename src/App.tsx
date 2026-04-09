import './App.css';
import { useEffect } from "react";
import StartButton from "./components/StartButton.tsx";
import Game from "./views/Game.tsx"
import Results from "./views/Results.tsx";
import {Routes, Route} from "react-router-dom";
import { preloadGameAssets } from "./utils/preloadGameAssets.tsx";

function LandingPage() {
    useEffect(() => {
        void preloadGameAssets();
    }, []);

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
          <Route path="/results" element={<Results />} />
      </Routes>
  );
}

export default App
