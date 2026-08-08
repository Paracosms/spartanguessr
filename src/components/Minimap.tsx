import { useEffect, useRef, useState } from "react";
import mapLabeled from "../assets/MapLabeled.jpg";
import mapUnlabeled from "../assets/MapUnlabeled.jpg";
import pin from "../assets/Pin.png";
import type { Point } from "../utils/types";
type ViewState = { scale: number; offset: Point };
type TouchPanState = {
    pointerId: number;
    startClient: Point;
    startLocal: Point;
    startOffset: Point;
};
type PinchState = {
    pointerIds: [number, number];
    startDistance: number;
    startScale: number;
    worldAtMidpoint: Point;
};
type MinimapProps = {
    pinPosition: Point | null;
    onPinChange: (point: Point) => void;
    unlabeled: boolean;
    allowPinPlacement?: boolean;
    mapHeightPx?: number;
    initialScale?: number;
    initialOffset?: Point; // starting pan position, defaults to INITIAL_MAP_POS
    minZoomFloor?: number;
    initializeScaleToMinZoom?: boolean;
    actualPosition?: Point | null;
    showActualDot?: boolean;
    showAlignmentLine?: boolean;
    heatmapPoints?: Point[];
    heatmapDotSize?: number;
    onTouchTap?: () => void;
    onTouchEdgeTap?: () => void;
    touchEdgeInsetPx?: number;
};
// Constants you might want to tweak
const INITIAL_MAP_POS = {x: -2100, y: -2300}
const PIN_SIZE_PX = 30;
const PIN_TIP_X_PERCENT = (203 / 388) * 100; // visible tip center in the source sprite
const INITIAL_SCALE = 1; // prod = 1.0
const ZOOM_SPEED = 0.05;

// Handles how far the image can be zoomed. Must be divisible by ZOOM_SPEED.
const BASE_MIN_ZOOM = 0.20;
const MAX_ZOOM = 2;
const FIT_ZOOM_PADDING = 0.98;
const TOUCH_DRAG_THRESHOLD_PX = 8;
const TOUCH_CLICK_SUPPRESSION_MS = 750;

// Minimap dimensions in px
const MINIMAP_WIDTH = 1428;
const MINIMAP_HEIGHT = 1503;


export default function Minimap({
    pinPosition,
    onPinChange,
    unlabeled,
    allowPinPlacement = true,
    mapHeightPx,
    initialScale = INITIAL_SCALE,
    initialOffset = INITIAL_MAP_POS,
    minZoomFloor,
    initializeScaleToMinZoom = false,
    actualPosition = null,
    showActualDot = false,
    showAlignmentLine = false,
    heatmapPoints = [],
    heatmapDotSize = 10,
    onTouchTap,
    onTouchEdgeTap,
    touchEdgeInsetPx = 24,
}: MinimapProps) {
    // Don't tweak
    const ASPECT_RATIO = MINIMAP_WIDTH/MINIMAP_HEIGHT;
    const [view, setView] = useState<ViewState>(() => ({
        scale: initialScale,
        offset: initialOffset,
    }));
    const [minZoom, setMinZoom] = useState(minZoomFloor ?? BASE_MIN_ZOOM);
    const [dragging, setDragging] = useState(false);
    const { scale, offset } = view;
    const dragStartRef = useRef({x:0, y:0});
    const dragMouseStartRef = useRef({x:0, y:0});
    const dragMovedRef = useRef(false);
    const userAdjustedZoomRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef(view);
    const activeTouchPointersRef = useRef(new Map<number, Point>());
    const touchPanRef = useRef<TouchPanState | null>(null);
    const pinchRef = useRef<PinchState | null>(null);
    const touchMovedRef = useRef(false);
    const touchHadMultiplePointersRef = useRef(false);
    const ignoreMouseClickUntilRef = useRef(0);

    useEffect(() => {
        viewRef.current = view;
    }, [view]);

    // Place pin
    function placePin(clientX: number, clientY: number) {
        if (!allowPinPlacement) {
            return;
        }

        // Obtain the div
        const container = containerRef.current;
        if (!container) return;

        // Convert the client position into the minimap's untransformed content
        // coordinates. The minimap is wrapped in a CSS scale that transitions
        // on hover, so use the actual rendered scale instead of a prop that can
        // be one frame ahead of the transform.
        const rect = container.getBoundingClientRect();
        const renderedScaleX = rect.width / container.offsetWidth;
        const renderedScaleY = rect.height / container.offsetHeight;
        if (!Number.isFinite(renderedScaleX) || !Number.isFinite(renderedScaleY) || renderedScaleX <= 0 || renderedScaleY <= 0) {
            return;
        }

        // getBoundingClientRect starts at the border edge, while the map image
        // and absolutely-positioned markers start at the inner content edge.
        const mouseX = (clientX - rect.left) / renderedScaleX - container.clientLeft;
        const mouseY = (clientY - rect.top) / renderedScaleY - container.clientTop;

        // Save pin in map coordinates so it remains anchored through zooms/pans
        const currentView = viewRef.current;
        onPinChange({
            x: clamp((mouseX - currentView.offset.x) / currentView.scale, 0, MINIMAP_WIDTH),
            y: clamp((mouseY - currentView.offset.y) / currentView.scale, 0, MINIMAP_HEIGHT),
        });
    }

    function handleClick(e: React.MouseEvent<HTMLDivElement>) {
        e.preventDefault();

        if (Date.now() < ignoreMouseClickUntilRef.current) {
            return;
        }

        // Ignore the click that naturally fires after panning
        if (dragMovedRef.current) {
            dragMovedRef.current = false;
            return;
        }

        placePin(e.clientX, e.clientY);
    }

    // Pan
    function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
        if (scale <= minZoom) return;

        e.preventDefault();
        setDragging(true);
        dragMovedRef.current = false;
        dragMouseStartRef.current = { x: e.clientX, y: e.clientY };

        const container = containerRef.current;
        if (!container) return;
        const mouse = getLocalPoint(container, e.clientX, e.clientY);

        // Prevents image from snapping the corner to the mouse (aka allows for relative image movement)
        // Also stores initial position of map before the pan movement
        dragStartRef.current = {
            x: mouse.x - offset.x,
            y: mouse.y - offset.y,
        };
    }

    // Zoom
    function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
        e.preventDefault();

        // Obtain the div
        const container = containerRef.current;
        if (!container) return;

        const { x: mouseX, y: mouseY } = getLocalPoint(container, e.clientX, e.clientY);

        setView((prev) => {
            const zoomFactor = e.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED;
            const nextScale = clamp(round(prev.scale + zoomFactor, 4), minZoom, MAX_ZOOM);

            // Avoid useless updates
            if (nextScale === prev.scale) return prev;

            userAdjustedZoomRef.current = true;

            // Keep the pan offset under the mouse fixed when zooming
            const worldX = (mouseX - prev.offset.x) / prev.scale;
            const worldY = (mouseY - prev.offset.y) / prev.scale;

            const unclampedOffset = {
                x: mouseX - worldX * nextScale,
                y: mouseY - worldY * nextScale,
            };

            const nextOffset = clampOffset(unclampedOffset, nextScale, container.clientWidth, container.clientHeight);

            return { scale: nextScale, offset: nextOffset };
        });
    }

    function beginPinch(container: HTMLDivElement) {
        const pointers = Array.from(activeTouchPointersRef.current.entries()).slice(0, 2);
        if (pointers.length < 2) return;

        const [[firstId, firstClient], [secondId, secondClient]] = pointers;
        const first = getLocalPoint(container, firstClient.x, firstClient.y);
        const second = getLocalPoint(container, secondClient.x, secondClient.y);
        const midpoint = getMidpoint(first, second);
        const currentView = viewRef.current;

        pinchRef.current = {
            pointerIds: [firstId, secondId],
            startDistance: getDistance(first, second),
            startScale: currentView.scale,
            worldAtMidpoint: {
                x: (midpoint.x - currentView.offset.x) / currentView.scale,
                y: (midpoint.y - currentView.offset.y) / currentView.scale,
            },
        };
        touchPanRef.current = null;
        touchMovedRef.current = true;
        touchHadMultiplePointersRef.current = true;
    }

    function beginTouchPan(pointerId: number, client: Point, container: HTMLDivElement) {
        touchPanRef.current = {
            pointerId,
            startClient: client,
            startLocal: getLocalPoint(container, client.x, client.y),
            startOffset: viewRef.current.offset,
        };
        pinchRef.current = null;
    }

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (e.pointerType !== "touch") return;

        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const client = { x: e.clientX, y: e.clientY };
        activeTouchPointersRef.current.set(e.pointerId, client);

        if (activeTouchPointersRef.current.size === 1) {
            touchMovedRef.current = false;
            touchHadMultiplePointersRef.current = false;
            beginTouchPan(e.pointerId, client, e.currentTarget);
        } else if (activeTouchPointersRef.current.size === 2) {
            beginPinch(e.currentTarget);
        }
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (e.pointerType !== "touch" || !activeTouchPointersRef.current.has(e.pointerId)) return;

        e.preventDefault();
        activeTouchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const container = e.currentTarget;
        const pinch = pinchRef.current;

        if (pinch) {
            const firstClient = activeTouchPointersRef.current.get(pinch.pointerIds[0]);
            const secondClient = activeTouchPointersRef.current.get(pinch.pointerIds[1]);
            if (!firstClient || !secondClient || pinch.startDistance <= 0) return;

            const first = getLocalPoint(container, firstClient.x, firstClient.y);
            const second = getLocalPoint(container, secondClient.x, secondClient.y);
            const midpoint = getMidpoint(first, second);
            const nextScale = clamp(
                pinch.startScale * (getDistance(first, second) / pinch.startDistance),
                minZoom,
                MAX_ZOOM
            );
            const nextView = {
                scale: nextScale,
                offset: clampOffset({
                    x: midpoint.x - pinch.worldAtMidpoint.x * nextScale,
                    y: midpoint.y - pinch.worldAtMidpoint.y * nextScale,
                }, nextScale, container.clientWidth, container.clientHeight),
            };

            userAdjustedZoomRef.current = true;
            viewRef.current = nextView;
            setView(nextView);
            return;
        }

        const pan = touchPanRef.current;
        if (!pan || pan.pointerId !== e.pointerId) return;

        const dragDistance = getDistance(pan.startClient, { x: e.clientX, y: e.clientY });
        if (dragDistance <= TOUCH_DRAG_THRESHOLD_PX) return;
        touchMovedRef.current = true;

        if (viewRef.current.scale <= minZoom) return;

        const local = getLocalPoint(container, e.clientX, e.clientY);
        const nextView = {
            ...viewRef.current,
            offset: clampOffset({
                x: pan.startOffset.x + local.x - pan.startLocal.x,
                y: pan.startOffset.y + local.y - pan.startLocal.y,
            }, viewRef.current.scale, container.clientWidth, container.clientHeight),
        };
        viewRef.current = nextView;
        setView(nextView);
    }

    function finishTouchPointer(e: React.PointerEvent<HTMLDivElement>, allowTap: boolean) {
        if (e.pointerType !== "touch" || !activeTouchPointersRef.current.has(e.pointerId)) return;

        e.preventDefault();
        const wasOnlyPointer = activeTouchPointersRef.current.size === 1;
        const isTap = allowTap && wasOnlyPointer && !touchMovedRef.current && !touchHadMultiplePointersRef.current;
        activeTouchPointersRef.current.delete(e.pointerId);
        ignoreMouseClickUntilRef.current = Date.now() + TOUCH_CLICK_SUPPRESSION_MS;

        if (isTap) {
            const container = e.currentTarget;
            if (onTouchEdgeTap && isWithinEdge(container, e.clientX, e.clientY, touchEdgeInsetPx)) {
                onTouchEdgeTap();
            } else if (onTouchTap) {
                onTouchTap();
            } else {
                placePin(e.clientX, e.clientY);
            }
        }

        if (activeTouchPointersRef.current.size === 0) {
            touchPanRef.current = null;
            pinchRef.current = null;
            touchMovedRef.current = false;
            touchHadMultiplePointersRef.current = false;
            return;
        }

        if (activeTouchPointersRef.current.size === 1) {
            const [remainingId, remainingClient] = activeTouchPointersRef.current.entries().next().value as [number, Point];
            beginTouchPan(remainingId, remainingClient, e.currentTarget);
            touchMovedRef.current = true;
        } else {
            beginPinch(e.currentTarget);
        }
    }

    // Listens for mouse input
    useEffect(() => {
        // Runs every time the mouse moves
        function handleMouseMove(e: MouseEvent) {
            if (!dragging) return;

            // Obtain the div
            const container = containerRef.current;
            if (!container) return;

            const width = container.clientWidth;
            const height = container.clientHeight;
            const mouse = getLocalPoint(container, e.clientX, e.clientY);

            const nextOffset = {
                x: mouse.x - dragStartRef.current.x,
                y: mouse.y - dragStartRef.current.y,
            };

            if (
                !dragMovedRef.current &&
                (
                    Math.abs(e.clientX - dragMouseStartRef.current.x) > 2 ||
                    Math.abs(e.clientY - dragMouseStartRef.current.y) > 2
                )
            ) {
                dragMovedRef.current = true;
            }

            setView((prev) => ({
                ...prev,
                offset: clampOffset(nextOffset, prev.scale, width, height),
            }));
        }

        function handleMouseUp() {
            setDragging(false);
        }

        // Enable functionality even when mouse leaves <div>
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        // Clean up functions to remove duplicates of event listeners
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [dragging, scale]); // Run when dragging or scale changes

    // Ensure map fits within boundaries
    useEffect(() => {
        function reclamp() {
            const container = containerRef.current;
            if (!container) return;

            const width = container.clientWidth;
            const height = container.clientHeight;
            if (width <= 0 || height <= 0) return;
            const nextMinZoom = minZoomFloor != null
                ? Math.max(getFitMinZoom(width, height), minZoomFloor)
                : getFitMinZoom(width, height);
            setMinZoom(nextMinZoom);

            setView((prev) => {
                const baseScale =
                    initializeScaleToMinZoom && !userAdjustedZoomRef.current ? nextMinZoom : prev.scale;
                const nextScale = clamp(baseScale, nextMinZoom, MAX_ZOOM);

                return {
                    scale: nextScale,
                    offset: clampOffset(prev.offset, nextScale, width, height),
                };
            });
        }

        reclamp();
        window.addEventListener("resize", reclamp);
        return () => window.removeEventListener("resize", reclamp);
    }, [minZoomFloor, initializeScaleToMinZoom, mapHeightPx]);

    // Prevent trackpad pinch-to-zoom on the minimap
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventZoom = (e: WheelEvent) => {
            if (e.ctrlKey) e.preventDefault();
        };

        container.addEventListener("wheel", preventZoom, { passive: false });
        return () => container.removeEventListener("wheel", preventZoom);
    }, []);

    const alignmentStart = pinPosition;
    const alignmentEnd = actualPosition;
    const alignmentLine = alignmentStart && alignmentEnd
        ? {
            length: Math.hypot(alignmentEnd.x - alignmentStart.x, alignmentEnd.y - alignmentStart.y),
            angle: Math.atan2(alignmentEnd.y - alignmentStart.y, alignmentEnd.x - alignmentStart.x) * (180 / Math.PI),
        }
        : null;

    return <>
    <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => finishTouchPointer(e, true)}
        onPointerCancel={(e) => finishTouchPointer(e, false)}
        onWheel={handleWheel}
        onClick={allowPinPlacement ? handleClick : undefined}
        className="minimap-shell"
        aria-label={allowPinPlacement ? "Campus map. Select your guess location." : "Campus map"}
        style={{
            height: mapHeightPx != null ? `${mapHeightPx}px` : "40vh",
            aspectRatio: `${ASPECT_RATIO}`,
            position: "relative",
            overflow: "hidden",
            userSelect: "none",
            cursor: allowPinPlacement ? "crosshair" : "grab",
            touchAction: "none",
        }}
    >
        <div
            style={{
                position: "absolute",
                width: `${MINIMAP_WIDTH}px`,
                height: `${MINIMAP_HEIGHT}px`,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: "top left",
                pointerEvents: "none",
            }}
        >
            <img
                className="minimap-img"
                src={unlabeled ? mapUnlabeled : mapLabeled}
                alt="Campus Minimap"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    userSelect: "none",
                }}
            />

            {showAlignmentLine && alignmentStart && alignmentLine && (
                <div
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        left: `${alignmentStart.x}px`,
                        top: `${alignmentStart.y}px`,
                        width: `${alignmentLine.length}px`,
                        height: `${2 / scale}px`,
                        background: "#000",
                        transformOrigin: "0 50%",
                        transform: `rotate(${alignmentLine.angle}deg)`,
                    }}
                />
            )}

            {pinPosition && (
                <img
                    src={pin}
                    alt="Selected location"
                    draggable={false}
                    style={{
                        position: "absolute",
                        left: `${pinPosition.x}px`,
                        top: `${pinPosition.y}px`,
                        transform: `scale(${1 / scale}) translate(${-PIN_TIP_X_PERCENT}%, -100%)`,
                        transformOrigin: "top left",
                        width: `${PIN_SIZE_PX / 1.5}px`,
                        userSelect: "none",
                    }}
                />
            )}
            {showActualDot && actualPosition && (
                <div
                    style={{
                        position: "absolute",
                        left: `${actualPosition.x}px`,
                        top: `${actualPosition.y}px`,
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "#ff3b30",
                        border: "2px solid white",
                        transform: `scale(${1 / scale}) translate(-50%, -50%)`,
                        transformOrigin: "top left",
                        boxShadow: "0 0 6px rgba(0, 0, 0, 0.6)",
                    }}
                />
            )}
            {heatmapPoints.map((point, index) => (
                <div
                    key={index}
                    style={{
                        position: "absolute",
                        left: `${point.x}px`,
                        top: `${point.y}px`,
                        width: `${heatmapDotSize}px`,
                        height: `${heatmapDotSize}px`,
                        borderRadius: "50%",
                        background: "#ff3b30",
                        border: "1px solid white",
                        transform: `scale(${1 / scale}) translate(-50%, -50%)`,
                        transformOrigin: "top left",
                        boxShadow: "0 0 3px rgba(0, 0, 0, 0.6)",
                    }}
                />
            ))}
        </div>
    </div>

    </>
}

// round with precision courtesy of stack overflow
function round(value: number, decimal_places: number): number {
    const multiplier: number = Math.pow(10, decimal_places || 0);
    return Math.round(value * multiplier) / multiplier;
}

function getFitMinZoom(containerWidth: number, containerHeight: number): number {
    const fitScale = Math.min(containerWidth / MINIMAP_WIDTH, containerHeight / MINIMAP_HEIGHT) * FIT_ZOOM_PADDING;
    return round(clamp(fitScale, BASE_MIN_ZOOM, MAX_ZOOM), 3);
}

function getLocalPoint(container: HTMLDivElement, clientX: number, clientY: number): Point {
    const rect = container.getBoundingClientRect();
    const style = window.getComputedStyle(container);
    const renderedScaleX = rect.width / Number.parseFloat(style.width);
    const renderedScaleY = rect.height / Number.parseFloat(style.height);

    return {
        x: (clientX - rect.left) / renderedScaleX - container.clientLeft,
        y: (clientY - rect.top) / renderedScaleY - container.clientTop,
    };
}

function getMidpoint(first: Point, second: Point): Point {
    return {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
    };
}

function getDistance(first: Point, second: Point): number {
    return Math.hypot(second.x - first.x, second.y - first.y);
}

function isWithinEdge(
    container: HTMLDivElement,
    clientX: number,
    clientY: number,
    edgeInsetPx: number
): boolean {
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const inset = Math.min(edgeInsetPx, rect.width / 2, rect.height / 2);

    return x <= inset || x >= rect.width - inset || y <= inset || y >= rect.height - inset;
}

// top 1 clamp function
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}


// secret chinese clamp function
function clampOffset(
    offset: Point,
    scale: number,
    containerWidth: number,
    containerHeight: number
): Point {
    const scaledWidth = MINIMAP_WIDTH * scale;
    const scaledHeight = MINIMAP_HEIGHT * scale;

    const centeredX = (containerWidth - scaledWidth) / 2;
    const centeredY = (containerHeight - scaledHeight) / 2;

    const minX = scaledWidth <= containerWidth ? centeredX : containerWidth - scaledWidth;
    const maxX = scaledWidth <= containerWidth ? centeredX : 0;

    const minY = scaledHeight <= containerHeight ? centeredY : containerHeight - scaledHeight;
    const maxY = scaledHeight <= containerHeight ? centeredY : 0;

    return {
        x: clamp(offset.x, minX, maxX),
        y: clamp(offset.y, minY, maxY),
    };
}


