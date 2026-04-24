import { useState, useEffect } from "react";
import {useLocation, useNavigate} from "react-router-dom";
import birdseyeBg from "../assets/Background.jpg";//"../assets/birdeye_campus.jpg";

const API_URL = "https://spartanguessr.onrender.com";
const BLUE = "#1176B9";
const GOLD = "#FFC108";

const RANK_COLORS: Record<number, string> = { 1: GOLD, 2: "#C0C0C0", 3: "#CD7F32" };

type LeaderboardEntry = {
    name: string;
    score: number;
    rank: number;
};

type ResultsRouteState = {
    totalScore?: number;
    sessionId?: string;
    leaderboardMode?: boolean;
} | null;

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
                if (submittedKey) sessionStorage.setItem(submittedKey, "true");
                fetchLeaderboard();
            }
        } catch (err) {
            console.error("Failed to submit score:", err);
        }
    }

    async function returnToMainMenu() {
        navigate("/")
    }

    function getRankLabel(rank: number) {
        const suffixes: Record<number, string> = { 1: "ST", 2: "ND", 3: "RD" };
        return `${rank}${suffixes[rank] ?? "TH"}`;
    }

    function getRowColor(rank: number) {
        return RANK_COLORS[rank] ?? "#ffffff";
    }

    return (
        <div style={{
            minHeight: "100vh",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0 1rem",
        }}>
            <div style={{
                position: "fixed",
                inset: "-20px",
                backgroundImage: `url(${birdseyeBg})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(1px) brightness(0.7)",
                zIndex: 0,
            }} />

            <div style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>

                <div style={{ marginBottom: "1rem", textAlign: "center" }}>
                    <p style={{ color: GOLD, fontSize: "0.8rem", marginTop: "0.75rem", marginBottom: "0.25rem", letterSpacing: "0.1em", fontWeight: 700 }}>
                        YOUR SCORE
                    </p>
                    <p style={{ color: GOLD, fontSize: "6.6rem", marginTop: 0, marginBottom: 0, fontWeight: 800, WebkitTextStroke: `6px ${BLUE}`, display: "inline-block", lineHeight: 1.1 }}>
                        {totalScore.toLocaleString()}
                    </p>
                </div>

                {leaderboardMode && qualifies && !submitted && (
                    <div style={{
                        marginBottom: "2rem",
                        textAlign: "center",
                        border: `2px solid ${GOLD}`,
                        padding: "1.25rem",
                        background: "rgba(0,0,0,0.5)",
                        maxWidth: 420,
                        width: "100%",
                        boxSizing: "border-box",
                    }}>
                        <p style={{ color: "#FF79B8", fontSize: "0.95rem", marginBottom: "1rem", fontWeight: 700 }}>
                            YOU MADE THE TOP 50!
                        </p>
                        <form onSubmit={handleSubmitName} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            <input
                                type="text"
                                placeholder="Enter your name"
                                value={name}
                                onChange={(e) => setName(e.target.value.toUpperCase())}
                                maxLength={20}
                                style={{
                                    background: "rgba(0,0,0,0.4)",
                                    border: `2px solid ${GOLD}`,
                                    color: GOLD,
                                    fontSize: "1rem",
                                    padding: "0.6rem 0.75rem",
                                    outline: "none",
                                    textAlign: "center",
                                    letterSpacing: "0.1em",
                                    fontFamily: "inherit",
                                }}
                            />
                            <button type="submit" style={{
                                background: GOLD,
                                border: "none",
                                color: "#000",
                                fontSize: "1rem",
                                fontWeight: 700,
                                padding: "0.6rem",
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}>
                                SUBMIT
                            </button>
                        </form>
                    </div>
                )}

                {!leaderboardMode && (
                    <p style={{ color: "#ccc", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
                        Play Leaderboard Mode to compete
                    </p>
                )}

                <div style={{
                    width: "100%",
                    maxWidth: 520,
                    background: "rgba(0,0,0,0.72)",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    maxHeight: "58vh",
                    borderRadius: "16px",
                    overflow: "hidden",
                }}>
                    <div style={{ flexShrink: 0, padding: "0.6rem 1.5rem 0" }}>
                        {submitted && (
                            <p style={{ color: GOLD, fontSize: "1rem", fontWeight: 700, margin: "0 0 0.3rem", textAlign: "center" }}>
                                Score saved! You ranked #{position}
                            </p>
                        )}
                        <h2 style={{
                            color: GOLD,
                            fontSize: "1.2rem",
                            textAlign: "center",
                            letterSpacing: "0.15em",
                            margin: 0,
                            paddingBottom: "0.5rem",
                            fontWeight: 800,
                        }}>
                            HIGH SCORES
                        </h2>
                    </div>

                    <div className="leaderboard-scroll" style={{ overflowY: "auto", padding: "0 1.5rem 1.5rem" }}>
                        {leaderboard.length === 0 ? (
                            <p style={{ color: "#ccc", textAlign: "center" }}>No scores yet. Be the first!</p>
                        ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr>
                                        {["RANK", "SCORE", "NAME"].map((h) => (
                                            <th key={h} style={{
                                                color: BLUE,
                                                fontSize: "0.85rem",
                                                padding: "0.5rem 0.75rem",
                                                letterSpacing: "0.1em",
                                                borderBottom: `3px solid ${GOLD}`,
                                                textAlign: "center",
                                                fontWeight: 700,
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map((entry, index) => {
                                        const color = getRowColor(entry.rank);
                                        return (
                                            <tr key={index}>
                                                <td style={{ color, fontSize: "0.85rem", padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600 }}>
                                                    {getRankLabel(entry.rank)}
                                                </td>
                                                <td style={{ color, fontSize: "0.85rem", padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600 }}>
                                                    {entry.score.toLocaleString()}
                                                </td>
                                                <td style={{ color, fontSize: "0.85rem", padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600 }}>
                                                    {entry.name.toUpperCase()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <button
                    onClick={returnToMainMenu}
                    style={{
                        marginTop: "1.5rem",
                        padding: "0.75rem 2rem",
                        background: GOLD,
                        color: "#000",
                        fontWeight: 700,
                        fontSize: "1rem",
                        border: "none",
                        borderRadius: "14px",
                        cursor: "pointer",
                        fontFamily: "inherit",}}
                >
                    Play Again
                </button>

            </div>
        </div>
    );
}
