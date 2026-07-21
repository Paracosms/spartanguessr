export type Point = {
    x: number;
    y: number;
};

export type ApiDifficulty = "easy" | "medium" | "hard";

export type GameRouteState = {
    sessionId?: string;
    roundCount?: number;
    difficulty?: ApiDifficulty;
    unlabeledMap?: boolean;
    outsideOnly?: boolean;
    timerLength?: string;
    seed?: string;
    leaderboardMode?: boolean;
} | null;

export type ResultsRouteState = {
    totalScore?: number;
    sessionId?: string;
    leaderboardMode?: boolean;
} | null;

export type ScoreRouteState = {
    guess_pos?: Point;
    actual_pos?: Point;
    image_url?: string;
    round_score?: number;
    round_number?: number;
    gameState?: GameRouteState;
    is_game_complete?: boolean;
    resultsState?: ResultsRouteState;
} | null;
