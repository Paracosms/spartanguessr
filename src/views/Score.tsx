import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Minimap from "../components/Minimap";

type Point = { x: number; y: number };
const BASE_MIN_ZOOM = 0.4;

type ApiDifficulty = "easy" | "medium" | "hard";

type GameRouteState = {
	sessionId?: string;
	roundCount?: number;
	difficulty?: ApiDifficulty;
	outsideOnly?: boolean;
	timerLength?: string;
	seed?: string;
	leaderboardMode?: boolean;
};

type ScoreRouteState = {
	guess_pos?: Point;
	actual_pos?: Point;
	image_url?: string;
	round_score?: number;
	round_number?: number;
	gameState?: GameRouteState;
	is_game_complete?: boolean;
	resultsState?: {
		totalScore?: number;
		sessionId?: string;
		leaderboardMode?: boolean;
	};
} | null;

const API_BASE_URL = "https://spartanguessr.onrender.com";

export default function Score() {
	const location = useLocation();
	const navigate = useNavigate();
	const routeState = location.state as ScoreRouteState;

	const guessPos = routeState?.guess_pos;
	const actualPos = routeState?.actual_pos;
	const imageUrl = routeState?.image_url;
	const gameState = routeState?.gameState;
	const isGameComplete = routeState?.is_game_complete === true;
	const resultsState = routeState?.resultsState;

	useEffect(() => {
		if (!guessPos || !actualPos || !imageUrl || (!gameState && !isGameComplete)) {
			navigate("/game", { replace: true });
		}
	}, [actualPos, gameState, guessPos, imageUrl, isGameComplete, navigate]);

	if (!guessPos || !actualPos || !imageUrl || (!gameState && !isGameComplete)) {
		return null;
	}

	const backgroundImageUrl = imageUrl.startsWith("http") ? imageUrl : `${API_BASE_URL}${imageUrl}`;

	function handleContinue() {
		if (isGameComplete) {
			navigate("/results", {
				state: {
					totalScore: resultsState?.totalScore ?? 0,
					sessionId: resultsState?.sessionId,
					leaderboardMode: resultsState?.leaderboardMode,
				},
			});
			return;
		}

		navigate("/game", { state: gameState });
	}

	return (
		<main
			style={{
				position: "relative",
				width: "100vw",
				height: "100vh",
				overflow: "hidden",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<div
				style={{
					position: "absolute",
					inset: 0,
					backgroundImage: `url(${backgroundImageUrl})`,
					backgroundSize: "cover",
					backgroundPosition: "center",
					filter: "blur(14px)",
					transform: "scale(1.05)",
				}}
			/>
			<div
				style={{
					position: "absolute",
					inset: 0,
					background: "rgba(0, 0, 0, 0.35)",
				}}
			/>

			<section
				style={{
					zIndex: 2,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1rem",
				}}
			>
				<Minimap
					pinPosition={guessPos}
					onPinChange={() => {}}
					allowPinPlacement={false}
					mapHeightVh={80}
					initialScale={BASE_MIN_ZOOM}
					actualPosition={actualPos}
					showActualDot
				/>

				<div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
					<button
						type="button"
						className="start-game-button"
						style={{ width: "280px" }}
						onClick={handleContinue}
					>
						Continue
					</button>

					<p className="text-black text-center bg-white rounded shadow border border-5 border-warning px-3 py-2 m-0" style={{ fontSize: "1.2rem", fontWeight: 600 }}>
						Round {routeState.round_number}: {routeState.round_score} points
					</p>
				</div>
			</section>
		</main>
	);
}









