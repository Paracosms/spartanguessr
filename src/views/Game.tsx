import { useCallback, useEffect, useState } from "react";
import Minimap from "../components/Minimap";
import GuessButton from "../components/GuessButton";
import Logo from "../assets/SpartanguessrLogo.png";
import Spear from "../assets/WebIcon.png";
import { useLocation, useNavigate } from "react-router-dom";
import type { ApiDifficulty, GameRouteState, Point } from "../utils/types";
import { ApiError, getRandomImage } from "../utils/api.tsx";
import { loadRoundImage } from "../utils/preloadGameAssets.tsx";
const GAME_MINIMAP_HEIGHT_MIN_PX = 378; // minimum height, keeps it usable on small viewports
const GAME_MINIMAP_HEIGHT_VH = 0.60; // fraction of viewport height, scales up on larger monitors
const GAME_MINIMAP_INITIAL_SCALE = 0.35; // starting zoom level for the minimap
const GAME_MINIMAP_INITIAL_OFFSET = {x: -114, y: -92}; // aj: guess and checked minimap
const GAME_MINIMAP_ASPECT_RATIO = 1428 / 1503;
const GAME_MINIMAP_COLLAPSED_SCALE = 0.7;
const GAME_MINIMAP_EXPANDED_SCALE = 1.2;
const MOBILE_PORTRAIT_EXPANDED_HEIGHT_VH = 0.5;
const MOBILE_VIEWPORT_GUTTER_PX = 16;
const MOBILE_CONTROLS_RESERVED_HEIGHT_PX = 120;

type ViewportState = {
    width: number;
    height: number;
    coarsePointer: boolean;
};

// scales minimap with viewport, never below minimum
function computeMinimapHeight(viewportHeight: number) {
    return Math.max(GAME_MINIMAP_HEIGHT_MIN_PX, Math.round(viewportHeight * GAME_MINIMAP_HEIGHT_VH));
}

function getViewportState(): ViewportState {
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    };
}

export default function Game() {
    const [pinPosition, setPinPosition] = useState<Point | null>(null);
    const [roundNumber, setRoundNumber] = useState(1);
    const [roundImageUrl, setRoundImageUrl] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [autoSubmitSignal, setAutoSubmitSignal] = useState(0);
    const [minimapHovered, setMinimapHovered] = useState(false); // shrink minimap when not hovered
    const [minimapTouchExpanded, setMinimapTouchExpanded] = useState(false);
    const [viewport, setViewport] = useState(getViewportState);
    const location = useLocation();
    const navigate = useNavigate();

    const useCompactLayout = viewport.coarsePointer || viewport.width <= 768 || viewport.height <= 640;
    const minimapHeightPx = computeMinimapHeight(viewport.height);
    const availableTouchMapHeight = Math.max(
        1,
        viewport.height - MOBILE_CONTROLS_RESERVED_HEIGHT_PX
    );
    const availableTouchMapWidthAsHeight = Math.max(
        1,
        (viewport.width - MOBILE_VIEWPORT_GUTTER_PX * 2) / GAME_MINIMAP_ASPECT_RATIO
    );
    const portraitTouchMapHeight = Math.min(
        viewport.height * MOBILE_PORTRAIT_EXPANDED_HEIGHT_VH,
        availableTouchMapHeight,
        availableTouchMapWidthAsHeight
    );
    const landscapeTouchMapHeight = Math.min(
        minimapHeightPx * GAME_MINIMAP_EXPANDED_SCALE,
        availableTouchMapHeight,
        availableTouchMapWidthAsHeight
    );
    const expandedTouchMapHeight = viewport.height >= viewport.width
        ? portraitTouchMapHeight
        : landscapeTouchMapHeight;
    const collapsedTouchMapHeight = Math.min(
        minimapHeightPx * GAME_MINIMAP_COLLAPSED_SCALE,
        expandedTouchMapHeight * (GAME_MINIMAP_COLLAPSED_SCALE / GAME_MINIMAP_EXPANDED_SCALE)
    );
    const minimapExpanded = minimapHovered || minimapTouchExpanded;
    const displayedMinimapHeightPx = useCompactLayout
        ? Math.round(minimapExpanded ? expandedTouchMapHeight : collapsedTouchMapHeight)
        : minimapHeightPx;
    const desktopMinimapScale = minimapExpanded
        ? GAME_MINIMAP_EXPANDED_SCALE
        : GAME_MINIMAP_COLLAPSED_SCALE;
    const minimapWrapperScale = useCompactLayout ? 1 : desktopMinimapScale;
    const guessButtonWidthPx = Math.round(
        (useCompactLayout ? collapsedTouchMapHeight : minimapHeightPx * GAME_MINIMAP_COLLAPSED_SCALE)
        * GAME_MINIMAP_ASPECT_RATIO
    );

    const gameState = location.state as GameRouteState;
    const requestedRoundCount = gameState?.roundCount;
    const sessionId = gameState?.sessionId ?? null;
    const expectedRound = gameState?.expectedRound;
    const maxRounds =
        typeof requestedRoundCount === "number" && requestedRoundCount > 0
            ? requestedRoundCount
            : 5;

    const difficulty: ApiDifficulty = gameState?.difficulty ?? "medium";
    const unlabeledMap = gameState?.unlabeledMap ?? false;
    const outsideOnly = gameState?.outsideOnly ?? false;
    const timerLength = gameState?.timerLength ?? "none";
    const seed = (gameState?.seed ?? "").trim();
    const leaderboardMode = gameState?.leaderboardMode ?? false;
    const timerSeconds = timerLength === "none" ? null : Number.parseInt(timerLength, 10);
    const roundTimerSeconds = Number.isFinite(timerSeconds) && timerSeconds != null && timerSeconds > 0 ? timerSeconds : null;
    const gameNavigationState: NonNullable<GameRouteState> = {
        sessionId: sessionId ?? undefined,
        expectedRound,
        roundCount: maxRounds,
        difficulty,
        outsideOnly,
        unlabeledMap,
        timerLength,
        seed,
        leaderboardMode,
    };

    function formatTimer(totalSeconds: number | null) {
        if (totalSeconds == null) {
            return "Off";
        }

        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    // receive image url
    const loadRandomImage = useCallback(async () => {
        if (!sessionId) {
            navigate("/", { replace: true });
            return;
        }

        try {
            setRoundImageUrl(null);
            const roundImage = expectedRound != null
                ? await loadRoundImage(sessionId, expectedRound)
                : await getRandomImage(sessionId);

            if (roundImage.completed) {
                return;
            }

            setRoundImageUrl(roundImage.image_url);
            setRoundNumber(roundImage.round_number);
            setTimeRemaining(roundTimerSeconds);
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                navigate("/", { replace: true });
                return;
            }
            console.error("FAIL", err);
        }
    }, [expectedRound, navigate, roundTimerSeconds, sessionId]);

    useEffect(() => {
        if (!sessionId) {
            navigate("/", { replace: true });
            return;
        }

        const timeoutId = window.setTimeout(() => {
            void loadRandomImage();
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [loadRandomImage, navigate, sessionId]);

    useEffect(() => {
        if (roundTimerSeconds == null || !roundImageUrl) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setTimeRemaining((previousTime) => {
                if (previousTime == null) {
                    return previousTime;
                }

                if (previousTime <= 1) {
                    window.clearInterval(intervalId);
                    setAutoSubmitSignal((signal) => signal + 1);
                    return 0;
                }

                return previousTime - 1;
            });
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [roundImageUrl, roundNumber, roundTimerSeconds]);

    // update minimap height on resize
    useEffect(() => {
        function handleResize() {
            setViewport(getViewportState());
        }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <main className="game-page">
            {roundImageUrl ? (
                <>
                    <div
                        className="game-location-backdrop"
                        aria-hidden="true"
                        style={{
                            backgroundImage: `url(${roundImageUrl})`,
                        }}
                    />
                    <img
                        className="game-location-image"
                        src={roundImageUrl}
                        alt="SJSU location to identify"
                        draggable={false}
                    />
                </>
            ) : (
                <div className="game-loading" role="status">
                    <img className="loading-spear" src={Spear} alt="" />
                    <p>Finding your next location…</p>
                </div>
            )}

            <div className="game-vignette" aria-hidden="true" />

            <header className="game-hud">
                <div className="game-brand-chip" aria-label="SpartanGuessr">
                    <img className="game-brand-logo" src={Logo} alt="SpartanGuessr" />
                </div>

                <div className="game-status-bar">
                    <p className="game-status game-round">
                        <span>Round</span>
                        <strong>{roundNumber}<i>/</i>{maxRounds}</strong>
                    </p>
                    <span className="status-divider" aria-hidden="true" />
                    <p className={`game-status game-timer${timeRemaining != null && timeRemaining <= 10 ? " is-urgent" : ""}`}>
                        <span>Time</span>
                        <strong>{formatTimer(timeRemaining)}</strong>
                    </p>
                </div>

                <div className="game-mode-chip">
                    <span>{leaderboardMode ? "Ranked" : "Classic"}</span>
                    <i aria-hidden="true">|</i>
                    <strong>{difficulty}</strong>
                </div>
            </header>

            <section className={`game-map-dock${minimapExpanded ? " is-expanded" : ""}`}>
                <div
                    className="game-minimap-stage"
                    onPointerEnter={(e) => {
                        if (e.pointerType === "mouse") setMinimapHovered(true);
                    }}
                    onPointerLeave={(e) => {
                        if (e.pointerType === "mouse") setMinimapHovered(false);
                    }}
                    style={{
                        transform: `scale(${minimapWrapperScale})`,
                        transformOrigin: "bottom right",
                    }}
                >
                    <Minimap
                        pinPosition={pinPosition}
                        unlabeled={unlabeledMap}
                        onPinChange={setPinPosition}
                        mapHeightPx={displayedMinimapHeightPx}
                        initialScale={GAME_MINIMAP_INITIAL_SCALE}
                        initialOffset={GAME_MINIMAP_INITIAL_OFFSET}
                        onTouchTap={minimapTouchExpanded ? undefined : () => setMinimapTouchExpanded(true)}
                        onTouchEdgeTap={minimapTouchExpanded ? () => setMinimapTouchExpanded(false) : undefined}
                    />
                </div>

                <div className="game-guess-control" style={{width: `${guessButtonWidthPx}px`}}>
                    <GuessButton
                        session_id={sessionId}
                        image_url={roundImageUrl}
                        round_number={roundNumber}
                        max_rounds={maxRounds}
                        coordinates={pinPosition}
                        gameState={gameNavigationState}
                        autoSubmitSignal={autoSubmitSignal}
                    />
                </div>
            </section>
        </main>
    );
}
