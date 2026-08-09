import { useEffect, useState } from "react";
import Minimap from "./Minimap.tsx";
import { getLeaderboard } from "../utils/api.tsx";
import type { LeaderboardEntry } from "../utils/api.tsx";
import type { Point } from "../utils/types.tsx";
import MouseLeftClick from "../assets/MouseLeftClick.svg";
import HandGrabbing from "../assets/HandGrabbing.svg";
import MouseScroll from "../assets/MouseScroll.svg";

const RANK_COLORS: Record<number, string> = { 1: "#FFC108", 2: "#C0C0C0", 3: "#CD7F32" };

function getRankLabel(rank: number) {
    const mod100 = rank % 100;
    const mod10 = rank % 10;
    if (mod100 >= 11 && mod100 <= 13) return `${rank}TH`;
    if (mod10 === 1) return `${rank}ST`;
    if (mod10 === 2) return `${rank}ND`;
    if (mod10 === 3) return `${rank}RD`;
    return `${rank}TH`;
}

export function LandingMapPanel() {
    const [pinPosition, setPinPosition] = useState<Point | null>(null);

    return (
        <aside className="landing-side-panel landing-map-panel">
            <header>
                <h2>Controls</h2>
            </header>
            <div className="landing-minimap-stage">
                <Minimap
                    pinPosition={pinPosition}
                    onPinChange={setPinPosition}
                    unlabeled={false}
                    initialScale={0.35}
                    initialOffset={{x: -114, y: -92}}
                />
            </div>
            <div className="landing-map-instruction" aria-label="Map controls">
                <span>Flag: <img src={MouseLeftClick} alt="" /></span>
                <span aria-hidden="true">|</span>
                <span>Pan: <img src={HandGrabbing} alt="" /></span>
                <span aria-hidden="true">|</span>
                <span>Zoom: <img src={MouseScroll} alt="" /></span>
            </div>
        </aside>
    );
}

type LandingLeaderboardPanelProps = {
    embedded?: boolean;
};

export function LandingLeaderboardPanel({ embedded = false }: LandingLeaderboardPanelProps) {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

    useEffect(() => {
        let cancelled = false;

        void getLeaderboard()
            .then((data) => {
                if (!cancelled) setLeaderboard(data);
            })
            .catch((err) => console.error("Failed to fetch leaderboard:", err));

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <aside
            className={`${embedded ? "landing-leaderboard-tab-panel" : "landing-side-panel"} landing-leaderboard-panel`}
            {...(embedded && {
                id: "landing-panel",
                role: "tabpanel",
                "aria-labelledby": "landing-tab-leaderboard",
            })}
        >
            <header>
                <h2>Leaderboard</h2>
            </header>
            <div className="landing-leaderboard-scroll">
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
                            {leaderboard.map((entry, index) => (
                                <tr key={index}>
                                    <td style={{color: RANK_COLORS[entry.rank] ?? "#ffffff"}}>
                                        <span>{getRankLabel(entry.rank)}</span>
                                    </td>
                                    <td>{entry.name.toUpperCase()}</td>
                                    <td>{entry.score.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </aside>
    );
}
