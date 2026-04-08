import './App.css';
import { useEffect } from "react";
import Game from "./views/Game.tsx"
import {Routes, Route} from "react-router-dom";
import { preloadGameAssets } from "./utils/preloadGameAssets.tsx";

function LandingPage() {
    useEffect(() => {
        void preloadGameAssets();
    }, []);

    return (
        <Game />
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
