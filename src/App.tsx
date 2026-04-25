import './App.css';
import Logo from "./assets/SpartanguessrLogo.png";
import { useEffect } from "react";
import StartButton from "./components/StartButton.tsx";
import Game from "./views/Game.tsx"
import Score from "./views/Score.tsx";
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
                <div className="d-flex justify-content-center">
                    <img src={Logo} style={{height: "20vh"}}/>
                </div>
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
          <Route path="/score" element={<Score />} />
          <Route path="/results" element={<Results />} />
      </Routes>
  );
}

export default App
