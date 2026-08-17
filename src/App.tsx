import Logo from "./assets/SpartanguessrLogo.png";
import { useEffect } from "react";
import LandingCenterPanel from "./components/LandingCenterPanel.tsx";
import Game from "./views/Game.tsx"
import Heatmap from "./views/Heatmap.tsx";
import MapPage from "./views/Map.tsx";
import Score from "./views/Score.tsx";
import Results from "./views/Results.tsx";
import {Routes, Route} from "react-router-dom";
import { preloadGameAssets } from "./utils/preloadGameAssets.tsx";
import { LandingLeaderboardPanel, LandingMapPanel } from "./components/LandingSidePanels.tsx";

function LandingPage() {
    useEffect(() => {
        void preloadGameAssets();
    }, []);

    return (
        <main className="landing-page">
            <section className="landing-shell">
                <div className="landing-content">
                    <img className="landing-logo" src={Logo} alt="SpartanGuessr" />
                    <p className="landing-subtitle">How well do you know SJSU?</p>
                    <div className="landing-desktop-layout">
                        <LandingMapPanel />
                        <LandingCenterPanel />
                        <LandingLeaderboardPanel />
                    </div>
                </div>
            </section>

            <p className="landing-footnote">made with love by andrew + friends :]</p>
        </main>
    );
}

function App() {

  return (
      <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/game" element={<Game />} />
          <Route path="/heatmap" element={<Heatmap />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/score" element={<Score />} />
          <Route path="/results" element={<Results />} />
      </Routes>
  );
}

export default App
