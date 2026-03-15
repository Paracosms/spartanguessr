import './App.css';
import StartButton from "./components/StartButton.tsx";

function App() {

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
  )
}

export default App
