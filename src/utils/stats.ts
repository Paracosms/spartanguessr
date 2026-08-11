import type { ApiDifficulty } from "./types.tsx";

const STATS_STORAGE_KEY = "spartanguessr_stats";
const STATS_VERSION = 1;
const MISSED_GUESS_COORDINATE = 99999;

export type BrowserStats = {
    version: typeof STATS_VERSION;
    playtimeMs: number;
    gamesStarted: number;
    gamesCompleted: number;
    rankedRunsCompleted: number;
    roundsPlayed: number;
    scoreTotal: number;
    rankedScoreTotal: number;
    bestRankedRun: number;
    perfects: number;
    distanceTotal: number;
    positionedGuesses: number;
    missedRounds: number;
    closestDistance: number | null;
    bestRoundScore: number;
    seenImages: Record<string, ApiDifficulty>;
    startedSessions: Record<string, true>;
    completedSessions: Record<string, true>;
    processedRounds: Record<string, true>;
};

type RoundResult = {
    sessionId: string;
    roundNumber: number;
    score: number;
    distance: number;
    guessX: number;
    guessY: number;
    ranked: boolean;
    gameComplete: boolean;
    totalScore: number;
};

function createEmptyStats(): BrowserStats {
    return {
        version: STATS_VERSION,
        playtimeMs: 0,
        gamesStarted: 0,
        gamesCompleted: 0,
        rankedRunsCompleted: 0,
        roundsPlayed: 0,
        scoreTotal: 0,
        rankedScoreTotal: 0,
        bestRankedRun: 0,
        perfects: 0,
        distanceTotal: 0,
        positionedGuesses: 0,
        missedRounds: 0,
        closestDistance: null,
        bestRoundScore: 0,
        seenImages: {},
        startedSessions: {},
        completedSessions: {},
        processedRounds: {},
    };
}

function storedNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function storedRecord<T>(value: unknown): Record<string, T> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, T>
        : {};
}

export function getBrowserStats(): BrowserStats {
    try {
        const stored = window.localStorage.getItem(STATS_STORAGE_KEY);
        if (!stored) return createEmptyStats();

        const parsed = JSON.parse(stored) as Partial<BrowserStats>;
        if (parsed.version !== STATS_VERSION) return createEmptyStats();

        return {
            version: STATS_VERSION,
            playtimeMs: storedNumber(parsed.playtimeMs),
            gamesStarted: storedNumber(parsed.gamesStarted),
            gamesCompleted: storedNumber(parsed.gamesCompleted),
            rankedRunsCompleted: storedNumber(parsed.rankedRunsCompleted),
            roundsPlayed: storedNumber(parsed.roundsPlayed),
            scoreTotal: storedNumber(parsed.scoreTotal),
            rankedScoreTotal: storedNumber(parsed.rankedScoreTotal),
            bestRankedRun: storedNumber(parsed.bestRankedRun),
            perfects: storedNumber(parsed.perfects),
            distanceTotal: storedNumber(parsed.distanceTotal),
            positionedGuesses: storedNumber(parsed.positionedGuesses),
            missedRounds: storedNumber(parsed.missedRounds),
            closestDistance: parsed.closestDistance == null ? null : storedNumber(parsed.closestDistance),
            bestRoundScore: storedNumber(parsed.bestRoundScore),
            seenImages: storedRecord<ApiDifficulty>(parsed.seenImages),
            startedSessions: storedRecord<true>(parsed.startedSessions),
            completedSessions: storedRecord<true>(parsed.completedSessions),
            processedRounds: storedRecord<true>(parsed.processedRounds),
        };
    } catch {
        return createEmptyStats();
    }
}

function updateBrowserStats(update: (stats: BrowserStats) => void) {
    const stats = getBrowserStats();
    update(stats);

    try {
        window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
    } catch {
        // Stats are optional and must never interrupt gameplay.
    }
}

export function recordGameStarted(sessionId: string) {
    updateBrowserStats((stats) => {
        if (stats.startedSessions[sessionId]) return;
        stats.startedSessions[sessionId] = true;
        stats.gamesStarted += 1;
    });
}

export function recordImageSeen(imageId: string, difficulty: ApiDifficulty) {
    updateBrowserStats((stats) => {
        stats.seenImages[imageId] = difficulty;
    });
}

export function recordRoundResult(result: RoundResult) {
    updateBrowserStats((stats) => {
        const roundKey = `${result.sessionId}:${result.roundNumber}`;
        if (stats.processedRounds[roundKey]) return;

        stats.processedRounds[roundKey] = true;
        stats.roundsPlayed += 1;
        stats.scoreTotal += result.score;
        stats.bestRoundScore = Math.max(stats.bestRoundScore, result.score);

        if (result.ranked) stats.rankedScoreTotal += result.score;
        if (result.score === 5000) stats.perfects += 1;

        const missed = result.guessX === MISSED_GUESS_COORDINATE
            && result.guessY === MISSED_GUESS_COORDINATE;
        if (missed) {
            stats.missedRounds += 1;
        } else {
            stats.distanceTotal += result.distance;
            stats.positionedGuesses += 1;
            stats.closestDistance = stats.closestDistance == null
                ? result.distance
                : Math.min(stats.closestDistance, result.distance);
        }

        if (result.gameComplete && !stats.completedSessions[result.sessionId]) {
            stats.completedSessions[result.sessionId] = true;
            stats.gamesCompleted += 1;

            if (result.ranked) {
                stats.rankedRunsCompleted += 1;
                stats.bestRankedRun = Math.max(stats.bestRankedRun, result.totalScore);
            }
        }
    });
}

export function addPlaytime(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;

    updateBrowserStats((stats) => {
        stats.playtimeMs += milliseconds;
    });
}
