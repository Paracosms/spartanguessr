import { useState, useEffect } from "react";
import {useLocation, useNavigate} from "react-router-dom";
import Background from "../assets/backgrounds/LeaderboardBackground.jpg";
import Logo from "../assets/SpartanguessrLogo.png";
import Trophy from "../assets/icons/Trophy.svg";
import type { ResultsRouteState } from "../utils/types";
import {
    getLeaderboard,
    getLeaderboardQualification,
    getSessionResults,
    submitLeaderboardEntry,
} from "../utils/api.tsx";
import type {
    LeaderboardEntry,
    LeaderboardPeriod,
    LeaderboardQualificationResponse,
    SubmitLeaderboardEntryResponse,
} from "../utils/api.tsx";
import { getRankLabel, RANK_COLORS } from "../utils/leaderboard.ts";

function getSubmissionMessage(boards: SubmitLeaderboardEntryResponse["boards"]) {
    const placements = (["daily", "weekly"] as const).flatMap((period) => {
        const board = boards[period];
        if (board.position === null) return [];
        const label = period === "daily" ? "Daily" : "Weekly";
        return `${label} #${board.position}`;
    });

    if (placements.length === 0) {
        return "The leaderboard changed before submission. Your score did not remain in either top 50.";
    }
    return `Score saved. ${placements.join(" · ")}.`;
}

export default function Results() {
    const location = useLocation();
    const routeState = location.state as ResultsRouteState;
    const leaderboardMode = routeState?.leaderboardMode ?? false;
    const sessionId = routeState?.sessionId ?? null;
    const submittedKey = sessionId ? `leaderboard_submitted_${sessionId}` : null;

    const [totalScore, setTotalScore] = useState<number>(0);
    const [qualification, setQualification] = useState<LeaderboardQualificationResponse | null>(null);
    const [name, setName] = useState<string>("");
    const [submitted, setSubmitted] = useState<boolean>(
        () => submittedKey ? sessionStorage.getItem(submittedKey) === "true" : false
    );
    const [placements, setPlacements] = useState<SubmitLeaderboardEntryResponse["boards"] | null>(null);
    const [activePeriod, setActivePeriod] = useState<LeaderboardPeriod>("daily");
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(true);
    const navigate = useNavigate();

    async function fetchLeaderboard(period: LeaderboardPeriod) {
        try {
            const data = await getLeaderboard(period);
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
                if (leaderboardMode && sessionId) {
                    try {
                        const data = await getLeaderboardQualification(sessionId);
                        if (!cancelled) {
                            setQualification(data);
                            if (data.submitted) setSubmitted(true);
                        }
                    } catch (err) {
                        console.error("Failed to check qualification:", err);
                    }
                }
            }
        }

        void loadServerScore();

        return () => {
            cancelled = true;
        };
    }, [routeState?.totalScore, sessionId, leaderboardMode]);

    useEffect(() => {
        let cancelled = false;

        void getLeaderboard(activePeriod)
            .then((data) => {
                if (!cancelled) setLeaderboard(data);
            })
            .catch((err) => console.error("Failed to fetch leaderboard:", err))
            .finally(() => {
                if (!cancelled) setIsLeaderboardLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [activePeriod]);

    async function handleSubmitName(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !sessionId) return;

        try {
            const result = await submitLeaderboardEntry(sessionId, name.trim());
            setPlacements(result.boards);
            setSubmitted(true);
            if (submittedKey) sessionStorage.setItem(submittedKey, "true");
            void fetchLeaderboard(activePeriod);
        } catch (err) {
            console.error("Failed to submit score:", err);
        }
    }

    function returnToMainMenu() {
        navigate("/")
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
                        <strong>{totalScore.toLocaleString()}</strong>
                        <small>points</small>
                    </div>

                    {leaderboardMode && sessionId && qualification?.qualifies && !submitted && (
                        <div className="qualification-card">
                            <p>
                                You made the {(["daily", "weekly"] as const)
                                    .filter((period) => qualification.boards[period].qualifies)
                                    .map((period) => period === "daily" ? "Daily" : "Weekly")
                                    .join(" and ")} top 50.
                            </p>
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
                            <div className="leaderboard-period-tabs" role="tablist" aria-label="Leaderboard period">
                                {(["daily", "weekly"] as const).map((period) => (
                                    <button
                                        key={period}
                                        type="button"
                                        role="tab"
                                        id={`results-leaderboard-${period}-tab`}
                                        aria-controls={`results-leaderboard-${period}-panel`}
                                        aria-selected={activePeriod === period}
                                        className={activePeriod === period ? "is-active" : ""}
                                        onClick={() => {
                                            if (period !== activePeriod) {
                                                setIsLeaderboardLoading(true);
                                                setLeaderboard([]);
                                                setActivePeriod(period);
                                            }
                                        }}
                                    >
                                        {period === "daily" ? "Daily" : "Weekly"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </header>

                    {submitted && placements && (
                        <p className="submission-message">{getSubmissionMessage(placements)}</p>
                    )}

                    <div
                        id={`results-leaderboard-${activePeriod}-panel`}
                        className="leaderboard-scroll"
                        role="tabpanel"
                        aria-labelledby={`results-leaderboard-${activePeriod}-tab`}
                    >
                        {isLeaderboardLoading ? (
                            <p className="empty-leaderboard">Loading leaderboard…</p>
                        ) : leaderboard.length === 0 ? (
                            <div className="empty-leaderboard">
                                <img className="empty-leaderboard-icon" src={Trophy} alt="" />
                                <p className="empty-leaderboard-copy">
                                    <strong>No scores yet.</strong>
                                    <span>Be the first Spartan on the board.</span>
                                </p>
                            </div>
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
                                        const color = RANK_COLORS[entry.rank] ?? "#ffffff";
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
