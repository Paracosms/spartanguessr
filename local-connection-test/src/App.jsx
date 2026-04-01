import './App.css';
import StartButton from "./components/StartButton.tsx";
import { useState, useEffect } from 'react'

function App() {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    fetch('/api/time').then(res => res.json()).then(data => {
      setCurrentTime(data.time);
    });
  }, []);

  return (
    <>
        <div className="d-flex flex-column align-items-center">
            <h1>Spartanguessr</h1>

            <div className="d-flex flex-column align-items-center gap-2">
                <StartButton/>
            </div>
            <p>The current time is {new Date(currentTime * 1000).toLocaleString()}.</p>
        </div>
    </>
  )
}

export default App