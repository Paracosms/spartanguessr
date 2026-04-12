import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

const API_URL = "http://localhost:5000";

type LeaderboardEntry = {
    name: string;
    score: number;
    rank: number;
};

type ResultsRouteState = {
    totalScore?: number;
    sessionId?: string;
} | null;

export default function Results() {
    const [totalScore, setTotalScore] = useState<number>(0);
    const [qualifies, setQualifies] = useState<boolean>(false);
    const [position, setPosition] = useState<number | null>(null);
    const [name, setName] = useState<string>("");
    const [submitted, setSubmitted] = useState<boolean>(false);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const location = useLocation();
    const routeState = location.state as ResultsRouteState;

    async function checkQualification(score: number) {
        try {
            const res = await fetch(`${API_URL}/leaderboard/qualify?score=${score}`);
            if (res.ok) {
                const data = await res.json();
                setQualifies(data.qualifies);
                setPosition(data.position);
            }
        } catch (err) {
            console.error("Failed to check qualification:", err);
        }
    }

    async function fetchLeaderboard() {
        try {
            const res = await fetch(`${API_URL}/leaderboard`);
            if (res.ok) {
                const data = await res.json();
                setLeaderboard(data);
            }
        } catch (err) {
            console.error("Failed to fetch leaderboard:", err);
        }
    }

    useEffect(() => {
        const resolvedScore =
            typeof routeState?.totalScore === "number" && Number.isFinite(routeState.totalScore)
                ? routeState.totalScore
                : 0;

        setTotalScore(resolvedScore);
        void checkQualification(resolvedScore);
        void fetchLeaderboard();
    }, [routeState?.totalScore]);

    async function handleSubmitName(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;

        try {
            const res = await fetch(`${API_URL}/leaderboard`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), score: totalScore }),
            });
            if (res.ok) {
                setSubmitted(true);
                fetchLeaderboard();
            }
        } catch (err) {
            console.error("Failed to submit score:", err);
        }
    }

    return (
        <div className="results-page" style={{ padding: "2rem", textAlign: "center" }}>
            <h1>Game Over</h1>
            <h2>Your Score: {totalScore}</h2>

            {qualifies && !submitted && (
                <div style={{ margin: "2rem 0" }}>
                    <h3>🎉 You made the top 50!</h3>
                    <form onSubmit={handleSubmitName}>
                        <input
                            type="text"
                            placeholder="Enter your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={20}
                            style={{ padding: "0.5rem", marginRight: "0.5rem" }}
                        />
                        <button type="submit" style={{ padding: "0.5rem 1rem" }}>
                            Submit
                        </button>
                    </form>
                </div>
            )}

            {submitted && (
                <p style={{ color: "green" }}>Score submitted! You ranked #{position}</p>
            )}

            <div style={{ marginTop: "2rem" }}>
                <h3>Leaderboard</h3>
                {leaderboard.length === 0 ? (
                    <p>No scores yet. Be the first!</p>
                ) : (
                    <table style={{ margin: "0 auto", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th style={{ padding: "0.5rem 1rem", borderBottom: "1px solid #ccc" }}>Rank</th>
                                <th style={{ padding: "0.5rem 1rem", borderBottom: "1px solid #ccc" }}>Name</th>
                                <th style={{ padding: "0.5rem 1rem", borderBottom: "1px solid #ccc" }}>Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaderboard.map((entry, index) => (
                                <tr key={index}>
                                    <td style={{ padding: "0.5rem 1rem" }}>{entry.rank}</td>
                                    <td style={{ padding: "0.5rem 1rem" }}>{entry.name}</td>
                                    <td style={{ padding: "0.5rem 1rem" }}>{entry.score}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}