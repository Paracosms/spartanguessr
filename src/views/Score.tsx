import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Minimap from "../components/Minimap";
import Logo from "../assets/SpartanguessrLogo.png";
import Pin from "../assets/maps/Pin.png";
import type { ScoreRouteState } from "../utils/types";
import { ApiError, startRound } from "../utils/api.tsx";
import { preloadNextRoundImage } from "../utils/preloadGameAssets.tsx";
const SCORE_MINIMAP_HEIGHT_VH = 0.58;
const SCORE_MINIMAP_ASPECT_RATIO = 1428 / 1503;
const SCORE_VIEWPORT_GUTTER_PX = 16;
const SCORE_NARROW_STACK_RESERVED_HEIGHT_PX = 420;
const SCORE_STACK_RESERVED_HEIGHT_PX = 380;

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
	const isShortLandscape = viewport.width > viewport.height && viewport.height <= 560;
	const isStacked = !isShortLandscape;
	const stackedReservedHeight = viewport.width <= 600
		? SCORE_NARROW_STACK_RESERVED_HEIGHT_PX
		: SCORE_STACK_RESERVED_HEIGHT_PX;
	const availableHeight = isStacked
		? viewport.height - stackedReservedHeight
		: viewport.height - 64;
	const availableMapWidth = isStacked
		? viewport.width - SCORE_VIEWPORT_GUTTER_PX * 2
		: viewport.width * 0.58;
	const availableWidthAsHeight = availableMapWidth / SCORE_MINIMAP_ASPECT_RATIO;

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
	const difficulty = gameState?.difficulty ?? "medium";
	const leaderboardMode = gameState?.leaderboardMode ?? false;
	const isGameComplete = routeState?.is_game_complete === true;
	const resultsState = routeState?.resultsState;
	const nextRoundNumber = routeState?.next_round_number;
	const [viewport, setViewport] = useState(getViewportState);
	const [isStartingRound, setIsStartingRound] = useState(false);
	const minimapHeightPx = computeMinimapHeight(viewport);
	const minimapWidthPx = Math.round(minimapHeightPx * SCORE_MINIMAP_ASPECT_RATIO);

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

	async function handleContinue() {
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
		if (!gameState?.sessionId || nextRoundNumber == null || isStartingRound) {
			return;
		}

		try {
			setIsStartingRound(true);
			await preloadNextRoundImage(gameState.sessionId, nextRoundNumber);
			await startRound(gameState.sessionId, nextRoundNumber);
			navigate("/game", {
				state: {
					...gameState,
					expectedRound: nextRoundNumber,
				},
			});
		} catch (err) {
			console.error("FAIL", err);
			alert(err instanceof ApiError ? err.message : "Unable to start the next round. Please try again.");
		} finally {
			setIsStartingRound(false);
		}
	}

	return (
		<main className="score-page">
			<div className="score-background" style={{backgroundImage: `url(${imageUrl})`}} />
			<div className="score-overlay" aria-hidden="true" />

			<header className="score-brand">
				<img className="screen-brand-logo" src={Logo} alt="SpartanGuessr" />
			</header>
			<div className="game-mode-chip score-mode-chip">
				<span>{leaderboardMode ? "Ranked" : "Classic"}</span>
				<i aria-hidden="true">|</i>
				<strong>{difficulty}</strong>
			</div>

			<section className="score-layout">
				<div className="score-map-panel" style={{width: `${minimapWidthPx}px`}}>
					<div className="panel-label">
						<span>Round {routeState.round_number}</span>
						<small>
							<img className="panel-pin-icon" src={Pin} alt="" />
							Your pin <i /> Actual location
						</small>
					</div>
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
				</div>

				<aside className="score-card">
					<div className="score-card-primary">
						<div className="round-score">
							<strong>{(routeState.round_score ?? 0).toLocaleString()}</strong>
							<span>points</span>
						</div>
					</div>
					<div className="score-card-divider" aria-hidden="true" />

					<div className="score-card-secondary">
						<p className="eyebrow">{isGameComplete ? "Final round complete" : "Round complete"}</p>
						<div className="round-progress" aria-label={`Round ${routeState.round_number} of ${gameState?.roundCount ?? routeState.round_number}`}>
							<span>Progress</span>
							<strong>{routeState.round_number} / {gameState?.roundCount ?? routeState.round_number}</strong>
						</div>

						<button type="button" className="primary-action score-continue" onClick={() => void handleContinue()} disabled={isStartingRound}>
							<span>{isStartingRound ? "Starting…" : isGameComplete ? "Finish game" : "Next round"}</span>
							<span aria-hidden="true">→</span>
						</button>
					</div>
				</aside>
			</section>
		</main>
	);
}










