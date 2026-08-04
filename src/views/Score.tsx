import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Minimap from "../components/Minimap";
import type { ScoreRouteState } from "../utils/types";
const SCORE_MINIMAP_HEIGHT_VH = 0.80;

function computeMinimapHeight() {
	return Math.round(window.innerHeight * SCORE_MINIMAP_HEIGHT_VH);
}

export default function Score() {
	const location = useLocation();
	const navigate = useNavigate();
	const routeState = location.state as ScoreRouteState;
	const guessPos = routeState?.guess_pos;
	const timedOutWithoutGuess = guessPos?.x === 99999 && guessPos?.y === 99999;
	const actualPos = routeState?.actual_pos;
	const imageUrl = routeState?.image_url;
	const gameState = routeState?.gameState;
	const isGameComplete = routeState?.is_game_complete === true;
	const resultsState = routeState?.resultsState;
	const nextRoundNumber = routeState?.next_round_number;
	const [minimapHeightPx, setMinimapHeightPx] = useState(computeMinimapHeight);

    const unlabeled = routeState?.gameState?.unlabeledMap ?? false;

	useEffect(() => {
		if (!guessPos || !actualPos || !imageUrl || (!gameState && !isGameComplete)) {
			navigate("/game", { replace: true });
		}
	}, [actualPos, gameState, guessPos, imageUrl, isGameComplete, navigate]);

	useEffect(() => {
		function handleResize() {
			setMinimapHeightPx(computeMinimapHeight());
		}

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	if (!guessPos || !actualPos || !imageUrl || (!gameState && !isGameComplete)) {
		return null;
	}

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

		navigate("/game", {
			state: {
				...gameState,
				expectedRound: nextRoundNumber,
			},
		});
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
					backgroundImage: `url(${imageUrl})`,
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
					mapHeightPx={minimapHeightPx}
                    unlabeled={unlabeled}
					initializeScaleToMinZoom
					actualPosition={actualPos}
					showActualDot
					showAlignmentLine={!timedOutWithoutGuess}
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










