import { useEffect, useState } from "react";
import { getImageCounts } from "../utils/api.tsx";
import type { ImageCountsResponse } from "../utils/api.tsx";
import { getBrowserStats } from "../utils/stats.ts";
import type { BrowserStats } from "../utils/stats.ts";
import type { ApiDifficulty } from "../utils/types.tsx";

function formatPlaytime(milliseconds: number) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function formatDistance(distance: number | null) {
    if (distance == null) return "—";
    return `${distance.toLocaleString(undefined, { maximumFractionDigits: 2 })} m`;
}

function getSeenCount(stats: BrowserStats, difficulty?: ApiDifficulty) {
    const difficulties = Object.values(stats.seenImages);
    return difficulty == null
        ? difficulties.length
        : difficulties.filter((value) => value === difficulty).length;
}

function formatDiscovery(seen: number, total: number | undefined, includePercentage = false) {
    if (total == null) return `${seen} / —`;
    if (!includePercentage || total === 0) return `${seen} / ${total}`;
    return `${seen} / ${total} (${Math.round((seen / total) * 100)}%)`;
}

export default function StatsPanel() {
    const [stats, setStats] = useState(getBrowserStats);
    const [imageCounts, setImageCounts] = useState<ImageCountsResponse | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        void getImageCounts(controller.signal)
            .then(setImageCounts)
            .catch((err) => {
                if (!(err instanceof DOMException && err.name === "AbortError")) {
                    console.error("Failed to fetch image counts:", err);
                }
            });

        function refreshStats() {
            setStats(getBrowserStats());
        }

        window.addEventListener("storage", refreshStats);
        return () => {
            controller.abort();
            window.removeEventListener("storage", refreshStats);
        };
    }, []);

    const averageScore = stats.roundsPlayed > 0
        ? stats.scoreTotal / stats.roundsPlayed
        : 0;
    const averageDistance = stats.positionedGuesses > 0
        ? stats.distanceTotal / stats.positionedGuesses
        : null;

    const columns = [
        {
            heading: "Play",
            rows: [
                ["Time played", formatPlaytime(stats.playtimeMs)],
                ["Games started", stats.gamesStarted.toLocaleString()],
                ["Games completed", stats.gamesCompleted.toLocaleString()],
                ["Rounds played", stats.roundsPlayed.toLocaleString()],
                ["Ranked runs completed", stats.rankedRunsCompleted.toLocaleString()],
                ["Missed rounds", stats.missedRounds.toLocaleString()],
            ],
        },
        {
            heading: "Performance",
            rows: [
                ["Total points earned", stats.scoreTotal.toLocaleString()],
                ["Ranked points earned", stats.rankedScoreTotal.toLocaleString()],
                ["Best ranked run", stats.bestRankedRun.toLocaleString()],
                ["Average score / round", Math.round(averageScore).toLocaleString()],
                ["Best round", stats.bestRoundScore.toLocaleString()],
                ["Perfect guesses", stats.perfects.toLocaleString()],
                ["Average distance", formatDistance(averageDistance)],
                ["Closest guess", formatDistance(stats.closestDistance)],
            ],
        },
        {
            heading: "Discovery",
            rows: [
                ["All images", formatDiscovery(getSeenCount(stats), imageCounts?.total, true)],
                ["Easy images", formatDiscovery(getSeenCount(stats, "easy"), imageCounts?.easy)],
                ["Medium images", formatDiscovery(getSeenCount(stats, "medium"), imageCounts?.medium)],
                ["Hard images", formatDiscovery(getSeenCount(stats, "hard"), imageCounts?.hard)],
            ],
        },
    ];

    return (
        <section
            className="stats-panel"
            id="landing-panel"
            role="tabpanel"
            aria-labelledby="landing-tab-stats"
        >
            <header>
                <h2>Your stats</h2>
                <p>Saved only in this browser.</p>
            </header>

            <div className="stats-columns">
                {columns.map((column) => (
                    <section className="stats-column" key={column.heading}>
                        <h3>{column.heading}</h3>
                        <dl>
                            {column.rows.map(([label, value]) => (
                                <div className="stats-row" key={label}>
                                    <dt>{label}</dt>
                                    <dd>{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
            </div>
        </section>
    );
}
