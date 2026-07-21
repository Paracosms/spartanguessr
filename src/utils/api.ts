const DEFAULT_API_BASE_URL = "https://spartanguessr-by1x.onrender.com";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

const API_BASE_URL = (configuredApiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

type CreateSessionRequest = {
    difficulty: "easy" | "medium" | "hard";
    max_rounds: number;
    outside_only: boolean;
    seed?: string;
    leaderboard_mode: boolean;
};

type SubmitGuessRequest = {
    session_id: string | null;
    round_number: number;
    guess_latitude: number;
    guess_longitude: number;
};

function apiFetch(path: string, init?: RequestInit) {
    return fetch(`${API_BASE_URL}${path}`, init);
}

function postJson(path: string, body: unknown) {
    return apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export function createSession(body: CreateSessionRequest) {
    return postJson("/session", body);
}

export function getRandomImage(sessionId: string) {
    const params = new URLSearchParams({ session_id: sessionId });
    return apiFetch(`/random-image?${params.toString()}`);
}

export function submitGuess(body: SubmitGuessRequest) {
    return postJson("/guess", body);
}

export function getLeaderboardQualification(score: number) {
    const params = new URLSearchParams({ score: String(score) });
    return apiFetch(`/leaderboard/qualify?${params.toString()}`);
}

export function getLeaderboard() {
    return apiFetch("/leaderboard");
}

export function getSessionResults(sessionId: string) {
    return apiFetch(`/session/${encodeURIComponent(sessionId)}/results`);
}

export function submitLeaderboardEntry(sessionId: string, name: string) {
    return postJson("/leaderboard", { session_id: sessionId, name });
}
