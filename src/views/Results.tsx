import { useState, useEffect } from "react";
import {useLocation, useNavigate} from "react-router-dom";
import Background from "../assets/LeaderboardBackground.jpg";
import Logo from "../assets/SpartanguessrLogo.png";
import type { ResultsRouteState } from "../utils/types";
import {
    getLeaderboard,
    getLeaderboardQualification,
    getSessionResults,
    submitLeaderboardEntry,
} from "../utils/api.tsx";
import type { LeaderboardEntry } from "../utils/api.tsx";
const BLUE = "#1176B9";
const GOLD = "#FFC108";

const RANK_COLORS: Record<number, string> = { 1: GOLD, 2: "#C0C0C0", 3: "#CD7F32" };

export default function Results() {
    const location = useLocation();
    const routeState = location.state as ResultsRouteState;
    const leaderboardMode = routeState?.leaderboardMode ?? false;
    const sessionId = routeState?.sessionId ?? null;
    const submittedKey = sessionId ? `leaderboard_submitted_${sessionId}` : null;

    const [totalScore, setTotalScore] = useState<number>(0);
    const [qualifies, setQualifies] = useState<boolean>(false);
    const [position, setPosition] = useState<number | null>(null);
    const [name, setName] = useState<string>("");
    const [submitted, setSubmitted] = useState<boolean>(
        () => submittedKey ? sessionStorage.getItem(submittedKey) === "true" : false
    );
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const navigate = useNavigate();

    async function checkQualification(score: number) {
        try {
            const data = await getLeaderboardQualification(score);
            setQualifies(data.qualifies);
            setPosition(data.position);
        } catch (err) {
            console.error("Failed to check qualification:", err);
        }
    }

    async function fetchLeaderboard() {
        try {
            const data = await getLeaderboard();
            setLeaderboard(data);
        } catch (err) {
            console.error("Failed to fetch leaderboard:", err);
        }
    }

    useEffect(() => {
        let cancelled = false;

        async function loadServerScore() {
            let resolvedScore =
                typeof routeState?.totalScore === "number" && Number.isFinite(routeState.totalScore)
                    ? routeState.totalScore
                    : 0;

            if (sessionId) {
                try {
                    const data = await getSessionResults(sessionId);
                    if (typeof data.total_score === "number" && Number.isFinite(data.total_score)) {
                        resolvedScore = data.total_score;
                    }
                } catch (err) {
                    console.error("Failed to fetch server score:", err);
                }
            }

            if (!cancelled) {
                setTotalScore(resolvedScore);
                void checkQualification(resolvedScore);
                void fetchLeaderboard();
            }
        }

        void loadServerScore();

        return () => {
            cancelled = true;
        };
    }, [routeState?.totalScore, sessionId]);

    async function handleSubmitName(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !sessionId) return;

        try {
            const result = await submitLeaderboardEntry(sessionId, name.trim());
            setPosition(result.position);
            setSubmitted(true);
            if (submittedKey) sessionStorage.setItem(submittedKey, "true");
            void fetchLeaderboard();
        } catch (err) {
            console.error("Failed to submit score:", err);
        }
    }

    function returnToMainMenu() {
        navigate("/")
    }

    function getRankLabel(rank: number) {
        const mod100 = rank % 100;
        const mod10 = rank % 10;
        if (mod100 >= 11 && mod100 <= 13) return `${rank}TH`; // 11th, 12th, 13th are exceptions
        if (mod10 === 1) return `${rank}ST`;
        if (mod10 === 2) return `${rank}ND`;
        if (mod10 === 3) return `${rank}RD`;
        return `${rank}TH`;
    }

    function getRowColor(rank: number) {
        return RANK_COLORS[rank] ?? "#ffffff";
    }

    return (
        <main className="results-page">
            <div className="results-background" style={{backgroundImage: `url(${Background})`}} />
            <div className="results-overlay" aria-hidden="true" />

            <header className="results-header">
                <div className="results-brand">
                    <img className="screen-brand-logo" src={Logo} alt="SpartanGuessr" />
                </div>
                <span className="results-mode">{leaderboardMode ? "Ranked run" : "Classic run"}</span>
            </header>

            <section className="results-shell">
                <div className="results-hero">
                    <div className="final-score">
                        <span>Your score</span>
                        <strong style={{WebkitTextStrokeColor: BLUE}}>{totalScore.toLocaleString()}</strong>
                        <small>points</small>
                    </div>

                    {leaderboardMode && sessionId && qualifies && !submitted && (
                        <div className="qualification-card">
                            <p>You made the top 50.</p>
                            <form onSubmit={handleSubmitName}>
                                <label className="visually-hidden" htmlFor="leaderboard-name">Leaderboard name</label>
                                <input
                                    id="leaderboard-name"
                                    type="text"
                                    placeholder="ENTER YOUR NAME"
                                    value={name}
                                    onChange={(e) => setName(e.target.value.toUpperCase())}
                                    maxLength={20}
                                />
                                <button type="submit">Submit</button>
                            </form>
                        </div>
                    )}

                    {!leaderboardMode && (
                        <p className="ranked-invite">Try Ranked to compete for a spot on the leaderboard.</p>
                    )}
                </div>

                <section className="leaderboard-card">
                    <header>
                        <div>
                            <h2>Leaderboard</h2>
                        </div>
                    </header>

                    {submitted && (
                        <p className="submission-message">Score saved — you ranked #{position}.</p>
                    )}

                    <div className="leaderboard-scroll">
                        {leaderboard.length === 0 ? (
                            <p className="empty-leaderboard">No scores yet. Be the first Spartan on the board.</p>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>Spartan</th>
                                        <th>Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map((entry, index) => {
                                        const color = getRowColor(entry.rank);
                                        return (
                                            <tr key={index}>
                                                <td style={{color}}><span>{getRankLabel(entry.rank)}</span></td>
                                                <td>{entry.name.toUpperCase()}</td>
                                                <td>{entry.score.toLocaleString()}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            )}
                    </div>

                    <button className="primary-action results-play-again" onClick={returnToMainMenu}>
                        <span>Play again</span><span aria-hidden="true">↻</span>
                    </button>
                </section>
            </section>
        </main>
    );
}
