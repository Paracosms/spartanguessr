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

    constructor(status: number, body: ApiErrorBody | null, message?: string) {
        super(message ?? (body?.error || `API request failed with status ${status}.`));
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

export class NetworkError extends ApiError {
    constructor(message = "Unable to reach the server. Check your connection and try again.") {
        super(0, null, message);
        this.name = "NetworkError";
    }
}

function buildApiUrl(path: string) {
    return `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(buildApiUrl(path), init);
    } catch (err) {
        // AbortError is an intentional cancellation; let callers handle it.
        if (err instanceof DOMException && err.name === "AbortError") {
            throw err;
        }
        // Everything else (offline, DNS, blocked, etc.) is a network failure.
        throw new NetworkError();
    }

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

function postJson<T>(path: string, body: unknown, signal?: AbortSignal) {
    return apiRequest<T>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
    });
}

export function createSession(body: CreateSessionRequest, signal?: AbortSignal) {
    return postJson<CreateSessionResponse>("/session", body, signal);
}

export function getRandomImage(sessionId: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ session_id: sessionId });
    return apiRequest<RandomImageResponse>(`/random-image?${params.toString()}`, { signal });
}

export function submitGuess(body: SubmitGuessRequest, signal?: AbortSignal) {
    return postJson<SubmitGuessResponse>("/guess", body, signal);
}

export function getLeaderboardQualification(score: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ score: String(score) });
    return apiRequest<LeaderboardQualificationResponse>(`/leaderboard/qualify?${params.toString()}`, { signal });
}

export function getLeaderboard(signal?: AbortSignal) {
    return apiRequest<LeaderboardEntry[]>("/leaderboard", { signal });
}

export function getSessionResults(sessionId: string, signal?: AbortSignal) {
    return apiRequest<SessionResultsResponse>(`/session/${encodeURIComponent(sessionId)}/results`, { signal });
}

export function submitLeaderboardEntry(sessionId: string, name: string, signal?: AbortSignal) {
    return postJson<SubmitLeaderboardEntryResponse>("/leaderboard", { session_id: sessionId, name }, signal);
}
