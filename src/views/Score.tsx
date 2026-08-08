import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Minimap from "../components/Minimap";
import Logo from "../assets/SpartanguessrLogo.png";
import Pin from "../assets/Pin.png";
import type { ScoreRouteState } from "../utils/types";
const SCORE_MINIMAP_HEIGHT_VH = 0.58;
const SCORE_MINIMAP_ASPECT_RATIO = 1428 / 1503;
const SCORE_VIEWPORT_GUTTER_PX = 16;
const SCORE_STACK_BREAKPOINT_PX = 900;

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
	const isStacked = viewport.width < SCORE_STACK_BREAKPOINT_PX && !isShortLandscape;
	const availableHeight = isStacked ? viewport.height - 260 : viewport.height - 64;
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
	const isGameComplete = routeState?.is_game_complete === true;
	const resultsState = routeState?.resultsState;
	const nextRoundNumber = routeState?.next_round_number;
	const [viewport, setViewport] = useState(getViewportState);
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
		<main className="score-page">
			<div className="score-background" style={{backgroundImage: `url(${imageUrl})`}} />
			<div className="score-overlay" aria-hidden="true" />

			<header className="score-brand">
				<img className="screen-brand-logo" src={Logo} alt="SpartanGuessr" />
			</header>

			<section className="score-layout">
				<div className="score-map-panel" style={{width: `${minimapWidthPx}px`}}>
					<div className="panel-label">
						<span>Round {routeState.round_number} reveal</span>
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

						<button type="button" className="primary-action score-continue" onClick={handleContinue}>
							<span>{isGameComplete ? "Finish game" : "Next round"}</span>
							<span aria-hidden="true">→</span>
						</button>
					</div>
				</aside>
			</section>
		</main>
	);
}










