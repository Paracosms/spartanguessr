const DEFAULT_API_BASE_URL = "https://spartanguessr-by1x.onrender.com";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = (configuredApiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

export type CreateSessionRequest = {
    difficulty: "easy" | "medium" | "hard";
    max_rounds: number;
    outside_only: boolean;
    seed?: string;
    leaderboard_mode: boolean;
};

export type CreateSessionResponse = {
    session_id: string;
    difficulty: "easy" | "medium" | "hard";
    max_rounds: number;
    current_round: number;
    outside_only: boolean;
    leaderboard_mode: boolean;
    total_score: number;
    created_at: string;
    seed?: string;
};

export type RandomImageResponse =
    | {
        completed: true;
        round_number: number;
        max_rounds: number;
    }
    | {
        completed?: false;
        difficulty: "easy" | "medium" | "hard";
        location?: string;
        image_url: string;
        round_number: number;
    };

export type SubmitGuessRequest = {
    session_id: string;
    round_number: number;
    guess_latitude: number;
    guess_longitude: number;
};

export type SubmitGuessResponse = {
    round_number: number;
    distance_meters: number;
    score: number;
    total_score: number;
    game_complete: boolean;
    next_round_number: number | null;
    actual_latitude: number;
    actual_longitude: number;
    guess_latitude: number;
    guess_longitude: number;
};

export type LeaderboardQualificationResponse = {
    qualifies: boolean;
    position: number | null;
};

export type LeaderboardEntry = {
    name: string;
    score: number;
    rank: number;
};

export type SessionResultsResponse = {
    session_id: string;
    difficulty: "easy" | "medium" | "hard";
    total_score: number;
    rounds_played: number;
    average_distance: number;
    smallest_distance: number;
    largest_distance: number;
    rounds: Array<{
        round_number: number;
        distance_meters: number;
        score: number;
    }>;
};

export type SubmitLeaderboardEntryResponse = {
    name: string;
    score: number;
    position: number;
};

type ApiErrorBody = {
    error?: string;
    [key: string]: unknown;
};

export class ApiError extends Error {
    readonly status: number;
    readonly body: ApiErrorBody | null;

    constructor(status: number, body: ApiErrorBody | null) {
        super(body?.error || `API request failed with status ${status}.`);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

function buildApiUrl(path: string) {
    return `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

export function resolveApiUrl(url: string) {
    if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("//")) {
        return url;
    }

    return buildApiUrl(url);
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(buildApiUrl(path), init);
    const responseText = await response.text();
    let body: unknown = null;

    if (responseText) {
        try {
            body = JSON.parse(responseText);
        } catch {
            if (response.ok) {
                throw new Error("API returned an invalid JSON response.");
            }
        }
    }

    if (!response.ok) {
        const errorBody = body && typeof body === "object" ? body as ApiErrorBody : null;
        throw new ApiError(response.status, errorBody);
    }

    return body as T;
}

function postJson<T>(path: string, body: unknown) {
    return apiRequest<T>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export function createSession(body: CreateSessionRequest) {
    return postJson<CreateSessionResponse>("/session", body);
}

export function getRandomImage(sessionId: string) {
    const params = new URLSearchParams({ session_id: sessionId });
    return apiRequest<RandomImageResponse>(`/random-image?${params.toString()}`);
}

export function submitGuess(body: SubmitGuessRequest) {
    return postJson<SubmitGuessResponse>("/guess", body);
}

export function getLeaderboardQualification(score: number) {
    const params = new URLSearchParams({ score: String(score) });
    return apiRequest<LeaderboardQualificationResponse>(`/leaderboard/qualify?${params.toString()}`);
}

export function getLeaderboard() {
    return apiRequest<LeaderboardEntry[]>("/leaderboard");
}

export function getSessionResults(sessionId: string) {
    return apiRequest<SessionResultsResponse>(`/session/${encodeURIComponent(sessionId)}/results`);
}

export function submitLeaderboardEntry(sessionId: string, name: string) {
    return postJson<SubmitLeaderboardEntryResponse>("/leaderboard", { session_id: sessionId, name });
}
