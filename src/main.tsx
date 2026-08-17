import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.css'
import './css/base.css'
import './css/panels.css'
import './css/leaderboard.css'
import './css/buttons.css'
import './css/landing.css'
import './css/game.css'
import './css/score.css'
import './css/results.css'
import './css/heatmap.css'
import './css/map.css'
import './css/resized.css'
import App from './App.tsx'
import { HashRouter } from "react-router-dom";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <HashRouter>
          <App />
      </HashRouter>
  </StrictMode>,
)
