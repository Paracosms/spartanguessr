import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Minimap from "../components/Minimap";
import type { ScoreRouteState } from "../utils/types";
const SCORE_MINIMAP_HEIGHT_VH = 0.80;
const SCORE_MINIMAP_ASPECT_RATIO = 1428 / 1503;
const SCORE_VIEWPORT_GUTTER_PX = 16;
const SCORE_LAYOUT_GAP_PX = 16;
const SCORE_STACK_BREAKPOINT_PX = 560;
const SCORE_ROW_CONTROLS_HEIGHT_PX = 56;
const SCORE_STACKED_CONTROLS_HEIGHT_PX = 128;

type ViewportState = {
	width: number;
	height: number;
};

function getViewportState(): ViewportState {
	return {
		width: window.innerWidth,
		height: window.innerHeight,
	};
}

function computeMinimapHeight(viewport: ViewportState) {
	const controlsHeight = viewport.width < SCORE_STACK_BREAKPOINT_PX
		? SCORE_STACKED_CONTROLS_HEIGHT_PX
		: SCORE_ROW_CONTROLS_HEIGHT_PX;
	const availableHeight = viewport.height
		- SCORE_VIEWPORT_GUTTER_PX * 2
		- SCORE_LAYOUT_GAP_PX
		- controlsHeight;
	const availableWidthAsHeight = (viewport.width - SCORE_VIEWPORT_GUTTER_PX * 2)
		/ SCORE_MINIMAP_ASPECT_RATIO;

	return Math.max(1, Math.round(Math.min(
		viewport.height * SCORE_MINIMAP_HEIGHT_VH,
		availableHeight,
		availableWidthAsHeight
	)));
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
	const [viewport, setViewport] = useState(getViewportState);
	const minimapHeightPx = computeMinimapHeight(viewport);

    const unlabeled = routeState?.gameState?.unlabeledMap ?? false;

	useEffect(() => {
		if (!guessPos || !actualPos || !imageUrl || (!gameState && !isGameComplete)) {
			navigate("/game", { replace: true });
		}
	}, [actualPos, gameState, guessPos, imageUrl, isGameComplete, navigate]);

	useEffect(() => {
		function handleResize() {
			setViewport(getViewportState());
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
				className="score-layout"
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

				<div className="score-controls">
					<button
						type="button"
						className="start-game-button score-continue"
						onClick={handleContinue}
					>
						Continue
					</button>

					<p className="score-summary text-black text-center bg-white rounded shadow border border-5 border-warning px-3 py-2 m-0">
						Round {routeState.round_number}: {routeState.round_score} points
					</p>
				</div>
			</section>
		</main>
	);
}










